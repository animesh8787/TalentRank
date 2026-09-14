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
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import (
    Candidate,
    Education,
    Job,
    ProcessingStatus,
    Skill,
    Upload,
    WorkExperience,
)
from app.services import embeddings, health_check, parsing
from app.services.extraction import ExtractionError, extract_text

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Event bus — fan-out of upload progress to any number of SSE listeners
# --------------------------------------------------------------------------- #
class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=256)
        with self._lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(q)

    def publish(self, event: dict) -> None:
        with self._lock:
            targets = list(self._subscribers)
        for q in targets:
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


def process_upload(upload_id: int) -> None:
    """Run one upload end to end. Safe to call on a worker thread."""
    db = SessionLocal()
    try:
        upload = db.get(Upload, upload_id)
        if upload is None:
            logger.warning("Upload %s vanished before processing.", upload_id)
            return

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
        existing = db.scalar(select(Candidate).where(Candidate.content_hash == digest))

        # 3. Parse -----------------------------------------------------------
        _set_state(db, upload, ProcessingStatus.PARSING, 45, "Extracting details")
        parsed = parsing.parse_resume(document.text)

        candidate = existing or Candidate()
        if existing:
            upload.is_duplicate = True
            _clear_children(db, candidate)

        _apply_parsed(candidate, parsed)
        candidate.resume_text = document.text
        candidate.content_hash = digest
        candidate.source_filename = upload.original_filename
        candidate.stored_filename = upload.stored_filename

        report = health_check.build_report(parsed, document)
        candidate.health_score = report["score"]
        candidate.health_report = report

        db.add(candidate)
        db.commit()
        db.refresh(candidate)

        # 4. Embed -----------------------------------------------------------
        _set_state(db, upload, ProcessingStatus.EMBEDDING, 75, "Building semantic index")
        vector = embeddings.embed_one(document.text[:8000])
        if vector is not None:
            candidate.embedding = vector
            db.add(candidate)
            db.commit()

        # 5. Score against every active job ----------------------------------
        from app.services.ranking import rescore_candidate_everywhere

        rescore_candidate_everywhere(db, candidate)

        upload.candidate_id = candidate.id
        upload.status = ProcessingStatus.DONE
        upload.progress = 100
        upload.completed_at = datetime.now(timezone.utc)
        db.add(upload)
        db.commit()

        bus.publish({
            "type": "upload.completed",
            "upload_id": upload.id,
            "filename": upload.original_filename,
            "status": upload.status.value,
            "progress": 100,
            "candidate_id": candidate.id,
            "candidate_name": candidate.full_name,
            "is_duplicate": upload.is_duplicate,
            "health_score": candidate.health_score,
            "error": None,
        })

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
# Worker pool
# --------------------------------------------------------------------------- #
_work_queue: queue.Queue[int] = queue.Queue()
_workers_started = False
_worker_lock = threading.Lock()


def _worker_loop() -> None:
    while True:
        upload_id = _work_queue.get()
        try:
            process_upload(upload_id)
        finally:
            _work_queue.task_done()


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


async def event_stream():
    """Async generator of SSE-formatted strings for FastAPI's StreamingResponse."""
    import json

    subscriber = bus.subscribe()
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
            yield f"data: {json.dumps(event)}\n\n"
    except asyncio.CancelledError:
        raise
    finally:
        bus.unsubscribe(subscriber)
