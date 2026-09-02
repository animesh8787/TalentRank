"""Ranked results, explanations, pipeline stages, notes, comparison, export."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import anonymized_requested, record_audit, require_staff
from app.core.database import get_db
from app.models import Job, Match, Note, PipelineStage, User
from app.schemas import (
    CandidateOut,
    MatchDetail,
    MatchOut,
    NoteCreate,
    NoteOut,
    StageUpdate,
    WeightPreviewRequest,
)
from app.services import anonymize, ranking

router = APIRouter(tags=["matches"])


def _job_or_404(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def _match_or_404(db: Session, match_id: int) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    return match


def _serialise(match: Match, rank: int, *, detail: bool, anonymized: bool):
    model = MatchDetail if detail else MatchOut
    payload = model.model_validate(match).model_dump()
    payload["rank"] = rank
    payload["note_count"] = len(match.notes)
    ratings = [n.rating for n in match.notes if n.rating]
    payload["average_rating"] = round(sum(ratings) / len(ratings), 2) if ratings else None

    if anonymized:
        payload["candidate"] = anonymize.anonymize_candidate(payload["candidate"])
        explanation = payload.get("explanation")
        if isinstance(explanation, dict) and explanation.get("evidence"):
            explanation["evidence"] = anonymize.anonymize_evidence(explanation["evidence"])
    return model.model_validate(payload)


@router.get("/jobs/{job_id}/matches", response_model=list[MatchOut])
def list_matches(
    job_id: int,
    request: Request,
    stage: PipelineStage | None = None,
    min_score: float = Query(0.0, ge=0, le=1),
    search: str | None = None,
    limit: int = Query(200, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[MatchOut]:
    _job_or_404(db, job_id)

    statement = (
        select(Match)
        .where(Match.job_id == job_id, Match.overall_score >= min_score)
        .order_by(Match.overall_score.desc())
        .limit(limit)
    )
    if stage:
        statement = statement.where(Match.stage == stage)

    matches = list(db.scalars(statement))
    if search:
        needle = search.strip().lower()
        matches = [
            m for m in matches
            if needle in (m.candidate.full_name or "").lower()
            or needle in (m.candidate.email or "").lower()
            or any(needle in s.name for s in m.candidate.skills)
        ]

    anonymized = anonymized_requested(request)
    return [
        _serialise(m, index, detail=False, anonymized=anonymized)
        for index, m in enumerate(matches, start=1)
    ]


@router.get("/matches/{match_id}", response_model=MatchDetail)
def get_match(
    match_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> MatchDetail:
    match = _match_or_404(db, match_id)
    # Recompute the live rank so the drawer agrees with the table.
    better = db.scalar(
        select(Match).where(
            Match.job_id == match.job_id, Match.overall_score > match.overall_score
        ).with_only_columns(Match.id).limit(1)
    )
    rank = 1
    if better is not None:
        from sqlalchemy import func

        rank = int(db.scalar(
            select(func.count(Match.id)).where(
                Match.job_id == match.job_id,
                Match.overall_score > match.overall_score,
            )
        ) or 0) + 1
    return _serialise(match, rank, detail=True, anonymized=anonymized_requested(request))


@router.post("/jobs/{job_id}/preview-weights")
def preview_weights(
    job_id: int,
    payload: WeightPreviewRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[dict]:
    """Re-rank in memory for the weight sliders — nothing is persisted."""
    job = _job_or_404(db, job_id)
    return ranking.preview_weights(db, job, payload.weights.model_dump())


@router.patch("/matches/{match_id}/stage", response_model=MatchOut)
def update_stage(
    match_id: int,
    payload: StageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> MatchOut:
    match = _match_or_404(db, match_id)
    previous = match.stage
    match.stage = payload.stage
    db.add(match)
    db.commit()
    db.refresh(match)

    record_audit(
        db, actor=user, action="match.stage", entity_type="match", entity_id=match.id,
        summary=(
            f"Moved {match.candidate.full_name or f'candidate #{match.candidate_id}'} "
            f"from {previous.value} to {payload.stage.value}"
        ),
        detail={"from": previous.value, "to": payload.stage.value},
    )
    return _serialise(match, 0, detail=False, anonymized=False)


@router.get("/matches/{match_id}/notes", response_model=list[NoteOut])
def list_notes(
    match_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[NoteOut]:
    match = _match_or_404(db, match_id)
    return [NoteOut.model_validate(n) for n in sorted(
        match.notes, key=lambda n: n.created_at, reverse=True
    )]


@router.post("/matches/{match_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def add_note(
    match_id: int,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> NoteOut:
    match = _match_or_404(db, match_id)
    note = Note(
        match_id=match.id,
        author_id=user.id,
        author_name=user.full_name,
        body=payload.body.strip(),
        rating=payload.rating,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return NoteOut.model_validate(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> None:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    if note.author_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own notes.")
    db.delete(note)
    db.commit()


@router.get("/jobs/{job_id}/compare", response_model=list[MatchDetail])
def compare(
    job_id: int,
    request: Request,
    ids: str = Query(..., description="Comma-separated match ids, 2-3 of them"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[MatchDetail]:
    _job_or_404(db, job_id)
    try:
        match_ids = [int(part) for part in ids.split(",") if part.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers.") from None
    if not 2 <= len(match_ids) <= 3:
        raise HTTPException(status_code=400, detail="Select 2 or 3 candidates to compare.")

    matches = list(db.scalars(
        select(Match).where(Match.id.in_(match_ids), Match.job_id == job_id)
    ))
    anonymized = anonymized_requested(request)
    ordered = sorted(matches, key=lambda m: m.overall_score, reverse=True)
    return [
        _serialise(m, index, detail=True, anonymized=anonymized)
        for index, m in enumerate(ordered, start=1)
    ]


@router.get("/jobs/{job_id}/export.csv")
def export_csv(
    job_id: int,
    request: Request,
    stage: PipelineStage | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> StreamingResponse:
    """Shortlist export for sharing with hiring managers."""
    job = _job_or_404(db, job_id)
    statement = (
        select(Match).where(Match.job_id == job_id).order_by(Match.overall_score.desc())
    )
    if stage:
        statement = statement.where(Match.stage == stage)
    matches = list(db.scalars(statement))
    anonymized = anonymized_requested(request)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Rank", "Name", "Email", "Phone", "Location", "Experience (yrs)",
        "Education", "Overall %", "Skills %", "Experience %", "Education %",
        "Relevance %", "Location %", "Stage", "Matched skills", "Missing skills",
    ])

    for rank, match in enumerate(matches, start=1):
        candidate = match.candidate
        explanation = match.explanation or {}
        name = (
            anonymize.alias_for(candidate.id) if anonymized
            else (candidate.full_name or f"Candidate #{candidate.id}")
        )
        writer.writerow([
            rank,
            name,
            "" if anonymized else (candidate.email or ""),
            "" if anonymized else (candidate.phone or ""),
            "" if anonymized else (candidate.location or ""),
            f"{candidate.total_experience:.0f}",
            candidate.highest_qualification or "",
            f"{match.overall_score * 100:.1f}",
            f"{match.skills_score * 100:.1f}",
            f"{match.experience_score * 100:.1f}",
            f"{match.education_score * 100:.1f}",
            f"{match.semantic_score * 100:.1f}",
            f"{match.location_score * 100:.1f}",
            match.stage.value,
            "; ".join(m.get("required", "") for m in explanation.get("matched_skills", [])),
            "; ".join(explanation.get("missing_skills", [])),
        ])

    record_audit(
        db, actor=user, action="match.export", entity_type="job", entity_id=job.id,
        summary=f"Exported {len(matches)} candidates for '{job.title}'"
        + (" (anonymised)" if anonymized else ""),
    )

    buffer.seek(0)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "" for c in job.title).strip()
    filename = f"{safe_title or 'shortlist'}-shortlist.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
