"""Persistence layer around the scorer.

Keeps `matches` rows in sync whenever a candidate is ingested, a job is edited,
or a recruiter drags the weight sliders.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Candidate, Job, JobStatus, Match
from app.services import embeddings, scoring

logger = logging.getLogger(__name__)


def job_profile_text(job: Job) -> str:
    """The text a resume is semantically compared against."""
    parts = [
        job.title or "",
        job.department or "",
        job.description or "",
        " ".join(job.required_skills or []),
        " ".join(job.nice_to_have_skills or []),
        job.required_education or "",
    ]
    return "\n".join(p for p in parts if p).strip()


def ensure_job_embedding(db: Session, job: Job) -> None:
    if job.embedding:
        return
    vector = embeddings.embed_one(job_profile_text(job)[:8000])
    if vector is not None:
        job.embedding = vector
        db.add(job)
        db.commit()


def _semantic_scores(job: Job, candidates: list[Candidate]) -> dict[int, float]:
    """Cosine similarity per candidate, or a corpus-wide TF-IDF fallback."""
    if job.embedding and all(c.embedding for c in candidates):
        return {
            c.id: embeddings.cosine(job.embedding, c.embedding) for c in candidates
        }

    # Fallback fits one vectoriser over the whole corpus so scores stay
    # comparable between candidates.
    documents = [(c.resume_text or "")[:8000] for c in candidates]
    similarities = embeddings.tfidf_similarities(job_profile_text(job), documents)
    return {c.id: similarities[i] if i < len(similarities) else 0.0
            for i, c in enumerate(candidates)}


def score_pair(job: Job, candidate: Candidate, semantic: float) -> scoring.ScoreResult:
    return scoring.score_candidate(
        candidate_skills=candidate.skill_names,
        candidate_experience=candidate.total_experience,
        candidate_education=candidate.highest_qualification,
        candidate_location=candidate.location,
        resume_text=candidate.resume_text or "",
        required_skills=job.required_skills or [],
        required_experience=job.required_experience,
        required_education=job.required_education,
        job_location=job.location,
        remote_ok=job.remote_ok,
        weights=job.weights,
        semantic_similarity=semantic,
    )


def _upsert_match(db: Session, job: Job, candidate: Candidate, result: scoring.ScoreResult) -> Match:
    match = db.scalar(
        select(Match).where(Match.job_id == job.id, Match.candidate_id == candidate.id)
    )
    if match is None:
        match = Match(job_id=job.id, candidate_id=candidate.id)

    match.overall_score = result.overall
    match.skills_score = result.dimensions["skills"].score
    match.experience_score = result.dimensions["experience"].score
    match.education_score = result.dimensions["education"].score
    match.semantic_score = result.dimensions["semantic"].score
    match.location_score = result.dimensions["location"].score
    match.explanation = result.explanation()
    db.add(match)
    return match


def rescore_job(db: Session, job: Job) -> int:
    """Re-score every candidate against one job. Returns the number scored."""
    ensure_job_embedding(db, job)
    candidates = list(db.scalars(select(Candidate)))
    if not candidates:
        return 0

    semantic = _semantic_scores(job, candidates)
    for candidate in candidates:
        result = score_pair(job, candidate, semantic.get(candidate.id, 0.0))
        _upsert_match(db, job, candidate, result)
    db.commit()
    logger.info("Re-scored %d candidates for job %s", len(candidates), job.id)
    return len(candidates)


def rescore_candidate_everywhere(db: Session, candidate: Candidate) -> int:
    """Score one candidate against every open job — used after ingestion."""
    jobs = list(db.scalars(select(Job).where(Job.status != JobStatus.CLOSED)))
    for job in jobs:
        ensure_job_embedding(db, job)
        semantic = _semantic_scores(job, [candidate]).get(candidate.id, 0.0)
        result = score_pair(job, candidate, semantic)
        _upsert_match(db, job, candidate, result)
    db.commit()
    return len(jobs)


def preview_weights(
    db: Session, job: Job, weights: dict[str, float]
) -> list[dict]:
    """Re-rank in memory for the live weight sliders, without writing to the DB."""
    matches = list(
        db.scalars(select(Match).where(Match.job_id == job.id))
    )
    normalised = scoring.normalise_weights(weights)

    preview: list[dict] = []
    for match in matches:
        per_dimension = {
            "skills": match.skills_score,
            "experience": match.experience_score,
            "education": match.education_score,
            "semantic": match.semantic_score,
            "location": match.location_score,
        }
        overall = sum(per_dimension[k] * normalised[k] for k in normalised)
        preview.append({
            "match_id": match.id,
            "candidate_id": match.candidate_id,
            "overall_score": round(overall, 4),
            "dimensions": per_dimension,
        })

    preview.sort(key=lambda row: row["overall_score"], reverse=True)
    for index, row in enumerate(preview, start=1):
        row["rank"] = index
    return preview
