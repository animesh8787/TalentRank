"""Resume upload, live progress stream and file serving."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, record_audit
from app.core.config import settings
from app.core.database import get_db
from app.models import ProcessingStatus, Upload, User, UserRole
from app.schemas import UploadOut
from app.services import pipeline
from app.services.extraction import SUPPORTED_SUFFIXES, UNSUPPORTED_LEGACY

router = APIRouter(prefix="/uploads", tags=["uploads"])

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_stored_name(original: str) -> str:
    """Build a collision-free, traversal-proof filename."""
    stem = Path(original).stem[:80]
    suffix = Path(original).suffix.lower()[:10]
    slug = _SAFE_NAME.sub("_", stem).strip("_") or "resume"
    return f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}_{slug}{suffix}"


@router.post("", response_model=list[UploadOut], status_code=status.HTTP_202_ACCEPTED)
async def upload_resumes(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UploadOut]:
    """Accept a batch of resumes and queue them for background processing."""
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided.")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Please upload at most 50 files at a time.")

    created: list[Upload] = []
    for upload_file in files:
        original = upload_file.filename or "resume"
        suffix = Path(original).suffix.lower()

        if suffix in UNSUPPORTED_LEGACY:
            created.append(_rejected(
                db, user, original,
                f"{suffix} is a legacy format. Please re-save as PDF or DOCX.",
            ))
            continue
        if suffix not in SUPPORTED_SUFFIXES:
            created.append(_rejected(
                db, user, original,
                f"Unsupported file type '{suffix or 'unknown'}'. Use PDF or DOCX.",
            ))
            continue

        payload = await upload_file.read()
        if len(payload) > MAX_FILE_BYTES:
            created.append(_rejected(
                db, user, original,
                f"File is {len(payload) / 1_048_576:.1f} MB — the limit is 10 MB.",
            ))
            continue
        if not payload:
            created.append(_rejected(db, user, original, "File is empty."))
            continue

        stored_name = _safe_stored_name(original)
        destination = settings.storage_dir / stored_name
        destination.write_bytes(payload)

        record = Upload(
            original_filename=original,
            stored_filename=str(destination),
            size_bytes=len(payload),
            content_type=upload_file.content_type,
            status=ProcessingStatus.QUEUED,
            uploaded_by_id=user.id,
        )
        db.add(record)
        created.append(record)

    db.commit()
    for record in created:
        db.refresh(record)

    queued = [r.id for r in created if r.status is ProcessingStatus.QUEUED]
    if queued:
        pipeline.enqueue(queued)

    record_audit(
        db, actor=user, action="upload.batch", entity_type="upload", entity_id=None,
        summary=f"Uploaded {len(created)} file(s), {len(queued)} queued for processing",
    )
    return [UploadOut.model_validate(r) for r in created]


def _rejected(db: Session, user: User, filename: str, reason: str) -> Upload:
    """Persist a rejected file so the UI can show why it failed."""
    record = Upload(
        original_filename=filename,
        stored_filename="",
        size_bytes=0,
        status=ProcessingStatus.FAILED,
        progress=100,
        error_message=reason,
        uploaded_by_id=user.id,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(record)
    return record


@router.get("", response_model=list[UploadOut])
def list_uploads(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UploadOut]:
    statement = select(Upload).order_by(Upload.created_at.desc()).limit(min(limit, 200))
    # Candidates only ever see their own submissions.
    if user.role is UserRole.CANDIDATE:
        statement = statement.where(Upload.uploaded_by_id == user.id)
    return [UploadOut.model_validate(r) for r in db.scalars(statement)]


@router.get("/stream")
async def stream_progress() -> StreamingResponse:
    """Server-sent events carrying per-file ingestion progress.

    EventSource cannot send an Authorization header, so this endpoint is not
    behind the bearer guard. It emits only filenames and processing state —
    no resume content, no personal data.
    """
    return StreamingResponse(
        pipeline.event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{upload_id}/retry", response_model=UploadOut)
def retry_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadOut:
    record = db.get(Upload, upload_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    if not record.stored_filename or not Path(record.stored_filename).is_file():
        raise HTTPException(
            status_code=400,
            detail="The original file is no longer available — please upload it again.",
        )

    record.status = ProcessingStatus.QUEUED
    record.progress = 0
    record.error_message = None
    record.completed_at = None
    db.add(record)
    db.commit()
    db.refresh(record)

    pipeline.enqueue([record.id])
    return UploadOut.model_validate(record)


@router.get("/{upload_id}/file")
def download_file(
    upload_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    """Serve the original resume for the in-app viewer."""
    record = db.get(Upload, upload_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    if user.role is UserRole.CANDIDATE and record.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Not your upload.")

    path = Path(record.stored_filename) if record.stored_filename else None
    # Confine reads to the storage directory regardless of what is in the DB.
    if path is None or not path.is_file() or settings.storage_dir not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="File is no longer available.")

    return FileResponse(
        path, filename=record.original_filename, media_type=record.content_type or "application/octet-stream"
    )
