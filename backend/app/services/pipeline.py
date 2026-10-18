"""Resume ingestion pipeline and its live event bus.

Fixes the biggest structural gap in the original project: uploading a resume
wrote a file to disk and nothing else happened until someone manually ran
`resume_processor.py`. Here an upload is queued, processed on a worker thread,
and every state change is broadcast to subscribed browsers over SSE.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import queue
import threading
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import (
    Candidate,
    Certification,
    Education,
    ProcessingStatus,
    Project,
    Skill,
    Upload,
    User,
    UserRole,
    WorkExperience,
)
from app.services import anonymize, embeddings, health_check, parsing, ranking, tenancy
from app.services.extraction import ExtractionError, extract_text

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Event bus — fan-out of upload progress to any number of SSE listeners
# --------------------------------------------------------------------------- #
EventFilter = Callable[[dict], bool]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[queue.Queue, EventFilter | None] = {}
        self._lock = threading.Lock()

    def subscribe(self, visible: EventFilter | None = None) -> queue.Queue:
        """Register a listener. `visible` decides which events it may receive."""
        q: queue.Queue = queue.Queue(maxsize=256)
        with self._lock:
            self._subscribers[q] = visible
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subscribers.pop(q, None)

    def publish(self, event: dict) -> None:
        with self._lock:
            targets = list(self._subscribers.items())
        for q, visible in targets:
            if visible is not None and not visible(event):
                continue
            try:
                q.put_nowait(event)
            except queue.Full:
                # A stalled browser must never block the worker thread.
                logger.debug("Dropping event for a saturated subscriber.")


bus = EventBus()


def _emit(upload: Upload, message: str | None = None) -> None:
    bus.publish({
        "type": "upload.progress",
        "upload_id": upload.id,
        "_owner_id": upload.uploaded_by_id,
        "_org_id": upload.org_id,
        "filename": upload.original_filename,
        "status": upload.status.value,
        "progress": upload.progress,
        "candidate_id": upload.candidate_id,
        "is_duplicate": upload.is_duplicate,
        "error": upload.error_message,
        "message": message,
    })


def _set_state(
    db: Session,
    upload: Upload,
    status: ProcessingStatus,
    progress: int,
    message: str | None = None,
) -> None:
    upload.status = status
    upload.progress = progress
    db.add(upload)
    db.commit()
    _emit(upload, message)


# --------------------------------------------------------------------------- #
# Persistence helpers
# --------------------------------------------------------------------------- #
def content_hash(text: str) -> str:
    """Hash of normalised resume text, used for duplicate detection."""
    normalised = " ".join(text.lower().split())
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _clear_children(db: Session, candidate: Candidate) -> None:
    """Delete a candidate's child rows and flush before re-inserting.

    Assigning a fresh list straight onto the relationship lets SQLAlchemy emit
    the INSERTs before the orphan DELETEs within a single flush, which trips the
    (candidate_id, name) unique constraint on skills when re-processing.
    """
    if candidate.id is None:
        return
    candidate.skills.clear()
    candidate.experiences.clear()
    candidate.educations.clear()
    candidate.projects.clear()
    candidate.certifications.clear()
    db.flush()


def _apply_parsed(candidate: Candidate, parsed: parsing.ParsedResume) -> None:
    candidate.full_name = parsed.full_name
    candidate.email = parsed.email
    candidate.phone = parsed.phone
    candidate.location = parsed.location
    candidate.linkedin_url = parsed.linkedin_url
    candidate.github_url = parsed.github_url
    candidate.portfolio_url = parsed.portfolio_url
    candidate.headline = parsed.headline
    candidate.total_experience = parsed.total_experience
    candidate.highest_qualification = parsed.highest_qualification
    candidate.university = parsed.university

    candidate.skills = [
        Skill(
            name=s.name,
            category=s.category,
            proficiency=s.proficiency,
            confidence=s.confidence,
            evidence=s.evidence,
        )
        for s in parsed.skills
    ]
    candidate.experiences = [
        WorkExperience(
            company=e.company,
            title=e.title,
            start_date=e.start_date,
            end_date=e.end_date,
            description=e.description,
        )
        for e in parsed.experiences
    ]
    candidate.educations = [
        Education(
            degree=e.degree,
            field_of_study=e.field_of_study,
            institution=e.institution,
            graduation_year=e.graduation_year,
        )
        for e in parsed.educations
    ]
    candidate.projects = [
        Project(
            name=p.name,
            description=p.description,
            technologies=p.technologies,
            url=p.url,
        )
        for p in parsed.projects
    ]
    candidate.certifications = [
        Certification(name=c.name, issuer=c.issuer, issue_date=c.issue_date)
        for c in parsed.certifications
    ]


def _target_candidate(db: Session, upload: Upload, digest: str) -> tuple[Candidate, bool]:
    """Pick the candidate record an upload should populate.

    * Re-processing an upload (retry, or re-queued after a restart) reuses the
      record it already created.
    * A candidate uploading their own resume fills in the profile created for
      them at registration, so /candidates/me shows it. That profile is in the
      talent pool (no organisation).
    * A recruiter's upload de-duplicates by content hash *within their own
      organisation* only: two teams uploading the same resume each get their
      own record, and neither can see the other's.

    Returns (candidate, is_duplicate).
    """
    if upload.candidate_id is not None:
        existing = db.get(Candidate, upload.candidate_id)
        if existing is not None:
            return existing, upload.is_duplicate

    uploader = db.get(User, upload.uploaded_by_id) if upload.uploaded_by_id else None
    if uploader is not None and uploader.role is UserRole.CANDIDATE:
        own = db.scalar(select(Candidate).where(Candidate.user_id == uploader.id))
        if own is not None:
            # Re-uploading the same file just refreshes the profile.
            return own, own.content_hash == digest
        return Candidate(user_id=uploader.id, email=uploader.email, org_id=None), False

    same_content = db.scalar(
        select(Candidate).where(
            Candidate.content_hash == digest, Candidate.org_id == upload.org_id
        )
    )
    if same_content is not None:
        return same_content, True
    return Candidate(org_id=upload.org_id), False


def _public_name(db: Session, upload: Upload, candidate: Candidate) -> str | None:
    """Name to show in the live progress stream.

    If the uploading organisation runs any blind-review job the real name
    never leaves the server, whatever the browser asks for.
    """
    if upload.org_id is not None and tenancy.org_has_blind_job(db, upload.org_id):
        return anonymize.alias_for(candidate.id)
    return candidate.full_name


def process_upload(upload_id: int, *, batch: bool = False) -> None:
    """Run one upload up to (and including) embedding. Safe on a worker thread.

    Scoring is the expensive, per-job step, so it is not done here when the
    upload is part of a batch: the worker defers it and `finalize_uploads`
    rescores each affected job once for the whole batch instead of once per
    file. Called directly (seed script) it finalises immediately.
    """
    db = SessionLocal()
    try:
        upload = db.get(Upload, upload_id)
        if upload is None:
            logger.warning("Upload %s vanished before processing.", upload_id)
            return
        if upload.status is ProcessingStatus.DONE:
            return  # duplicate queue entry (e.g. retried while a re-queue was pending)

        path = Path(upload.stored_filename)

        # 1. Extract ---------------------------------------------------------
        _set_state(db, upload, ProcessingStatus.EXTRACTING, 15, "Reading document")
        try:
            document = extract_text(path)
        except ExtractionError as exc:
            upload.status = ProcessingStatus.FAILED
            upload.error_message = str(exc)
            upload.progress = 100
            upload.completed_at = datetime.now(timezone.utc)
            db.add(upload)
            db.commit()
            _emit(upload)
            return

        # 2. Duplicate check -------------------------------------------------
        digest = content_hash(document.text)
        candidate, is_duplicate = _target_candidate(db, upload, digest)

        # 3. Parse -----------------------------------------------------------
        _set_state(db, upload, ProcessingStatus.PARSING, 45, "Extracting details")
        parsed = parsing.parse_resume(document.text)

        upload.is_duplicate = is_duplicate
        _clear_children(db, candidate)

        previous_name, previous_email = candidate.full_name, candidate.email
        _apply_parsed(candidate, parsed)
        # Keep what registration recorded when the parser can't find a value.
        candidate.full_name = candidate.full_name or previous_name
        candidate.email = candidate.email or previous_email
        # Fresh parse replaces any earlier corrections, so it needs re-review.
        candidate.verified_by_candidate = False
        candidate.resume_text = document.text
        candidate.content_hash = digest
        candidate.source_filename = upload.original_filename
        candidate.stored_filename = upload.stored_filename

        report = health_check.build_report(parsed, document)
        candidate.health_score = report["score"]
        candidate.health_report = report

        candidate.latest_upload_id = upload.id
        db.add(candidate)
        db.commit()
        db.refresh(candidate)
        # Remember the record immediately so a restart mid-pipeline re-uses it.
        upload.candidate_id = candidate.id
        db.add(upload)
        db.commit()

        # 4. Embed -----------------------------------------------------------
        _set_state(db, upload, ProcessingStatus.EMBEDDING, 75, "Building semantic index")
        vector = embeddings.embed_one(document.text[:8000])
        if vector is not None:
            candidate.embedding = vector
            db.add(candidate)
            db.commit()

        # 5. Score (batched) -------------------------------------------------
        if batch:
            with _pending_lock:
                _pending.append((upload.id, candidate.id))
        else:
            finalize_uploads([(upload.id, candidate.id)])

    except Exception as exc:  # noqa: BLE001 - a worker must never die silently
        logger.exception("Pipeline failed for upload %s", upload_id)
        try:
            upload = db.get(Upload, upload_id)
            if upload is not None:
                upload.status = ProcessingStatus.FAILED
                upload.error_message = f"{type(exc).__name__}: {exc}"
                upload.progress = 100
                upload.completed_at = datetime.now(timezone.utc)
                db.add(upload)
                db.commit()
                _emit(upload)
        except Exception:  # noqa: BLE001
            logger.exception("Could not record failure for upload %s", upload_id)
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Batched scoring
# --------------------------------------------------------------------------- #
_pending: list[tuple[int, int]] = []  # (upload_id, candidate_id) awaiting scoring
_pending_lock = threading.Lock()


def finalize_uploads(pairs: list[tuple[int, int]]) -> None:
    """Score the affected jobs once, then mark every upload in the batch done."""
    if not pairs:
        return
    db = SessionLocal()
    try:
        job_ids: set[int] = set()
        for _, candidate_id in pairs:
            candidate = db.get(Candidate, candidate_id)
            if candidate is not None and ranking.has_resume(candidate):
                job_ids.update(job.id for job in ranking.jobs_for_candidate(db, candidate))
        ranking.rescore_jobs(db, job_ids)

        for upload_id, candidate_id in pairs:
            upload = db.get(Upload, upload_id)
            candidate = db.get(Candidate, candidate_id)
            if upload is None or candidate is None:
                continue
            upload.candidate_id = candidate.id
            upload.status = ProcessingStatus.DONE
            upload.progress = 100
            upload.completed_at = datetime.now(timezone.utc)
            db.add(upload)
            db.commit()
            bus.publish({
                "type": "upload.completed",
                "upload_id": upload.id,
                "_owner_id": upload.uploaded_by_id,
                "_org_id": upload.org_id,
                "filename": upload.original_filename,
                "status": upload.status.value,
                "progress": 100,
                "candidate_id": candidate.id,
                "candidate_name": _public_name(db, upload, candidate),
                "is_duplicate": upload.is_duplicate,
                "health_score": candidate.health_score,
                "error": None,
            })
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scoring failed for a batch of %d upload(s)", len(pairs))
        db.rollback()
        for upload_id, _ in pairs:
            upload = db.get(Upload, upload_id)
            if upload is not None and upload.status is not ProcessingStatus.DONE:
                upload.status = ProcessingStatus.FAILED
                upload.error_message = f"{type(exc).__name__}: {exc}"
                upload.progress = 100
                upload.completed_at = datetime.now(timezone.utc)
                db.add(upload)
                db.commit()
                _emit(upload)
    finally:
        db.close()


def flush_pending() -> None:
    with _pending_lock:
        pairs = list(_pending)
        _pending.clear()
    finalize_uploads(pairs)


# --------------------------------------------------------------------------- #
# Worker pool
# --------------------------------------------------------------------------- #
_work_queue: queue.Queue[int] = queue.Queue()
_workers_started = False
_worker_lock = threading.Lock()


def _worker_loop() -> None:
    while True:
        upload_id = _work_queue.get()
        try:
            process_upload(upload_id, batch=True)
        finally:
            _work_queue.task_done()
        # Whichever worker finishes last drains the batch; the other sees an
        # empty list. unfinished_tasks counts items another worker still holds.
        if _work_queue.unfinished_tasks == 0:
            flush_pending()


def start_workers(count: int = 2) -> None:
    """Spin up background threads once, at application startup."""
    global _workers_started
    with _worker_lock:
        if _workers_started:
            return
        for index in range(count):
            thread = threading.Thread(
                target=_worker_loop, name=f"resume-worker-{index}", daemon=True
            )
            thread.start()
        _workers_started = True
        logger.info("Started %d resume ingestion workers.", count)


def enqueue(upload_ids: Iterable[int]) -> None:
    start_workers()
    for upload_id in upload_ids:
        _work_queue.put(upload_id)


def requeue_unfinished() -> int:
    """Re-enqueue uploads a restart interrupted.

    The work queue is in memory, so anything that was QUEUED or mid-pipeline
    when the process died would otherwise sit at that status forever.
    """
    with SessionLocal() as db:
        stuck = list(db.scalars(
            select(Upload).where(
                Upload.status.not_in([ProcessingStatus.DONE, ProcessingStatus.FAILED])
            ).order_by(Upload.id)
        ))
        runnable: list[int] = []
        for upload in stuck:
            if upload.stored_filename and Path(upload.stored_filename).is_file():
                upload.status = ProcessingStatus.QUEUED
                upload.progress = 0
                runnable.append(upload.id)
            else:
                upload.status = ProcessingStatus.FAILED
                upload.error_message = "Interrupted by a restart and the file is gone; please upload it again."
                upload.progress = 100
                upload.completed_at = datetime.now(timezone.utc)
            db.add(upload)
        db.commit()
    if runnable:
        enqueue(runnable)
        logger.info("Re-queued %d upload(s) interrupted by a restart.", len(runnable))
    return len(runnable)


def visible_to(user_id: int, role: UserRole, org_id: int | None = None) -> EventFilter:
    """Admins see every upload, recruiters their organisation's, candidates their own."""
    if role is UserRole.ADMIN:
        return lambda event: True
    if role is UserRole.CANDIDATE:
        return lambda event: event.get("_owner_id") == user_id
    # A recruiter with no organisation sees nothing.
    return lambda event: org_id is not None and event.get("_org_id") == org_id


async def event_stream(visible: EventFilter):
    """Async generator of SSE-formatted strings for FastAPI's StreamingResponse."""
    import json

    subscriber = bus.subscribe(visible)
    loop = asyncio.get_running_loop()
    try:
        yield ": connected\n\n"
        while True:
            try:
                # Bridge the thread-safe queue into asyncio without blocking it.
                event = await loop.run_in_executor(
                    None, lambda: subscriber.get(timeout=20)
                )
            except queue.Empty:
                yield ": keep-alive\n\n"  # keeps proxies from closing the stream
                continue
            # Routing metadata stays server-side.
            public = {k: v for k, v in event.items() if not k.startswith("_")}
            yield f"data: {json.dumps(public)}\n\n"
    except asyncio.CancelledError:
        raise
    finally:
        bus.unsubscribe(subscriber)
