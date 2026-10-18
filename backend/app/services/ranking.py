"""Persistence layer around the scorer.

Keeps `matches` rows in sync whenever a candidate is ingested, a job is edited,
or a recruiter drags the weight sliders.
"""
from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Candidate, Job, Match
from app.services import embeddings, scoring, tenancy

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


def _semantic_scores(
    job: Job, candidates: list[Candidate], corpus: list[Candidate] | None = None
) -> dict[int, float]:
    """Cosine similarity per candidate, or a corpus-wide TF-IDF fallback.

    `corpus` is the full set of resumes the TF-IDF vector space is fitted
    over; it defaults to `candidates` but callers scoring a subset (e.g. one
    newly ingested candidate) must pass the whole corpus explicitly. Fitting
    over just the subset being persisted is what made scores incomparable
    depending on whether a candidate was scored at ingestion time (a
    two-document fit against just the job) or at a full job rescore (fitted
    over everyone) — see embeddings.py's module docstring.
    """
    if job.embedding and all(c.embedding for c in candidates):
        return {
            c.id: embeddings.cosine(job.embedding, c.embedding) for c in candidates
        }

    corpus = candidates if corpus is None else corpus
    documents = [(c.resume_text or "")[:8000] for c in corpus]
    similarities = embeddings.tfidf_similarities(job_profile_text(job), documents)
    index = {c.id: i for i, c in enumerate(corpus)}
    return {
        c.id: similarities[index[c.id]] if c.id in index and index[c.id] < len(similarities) else 0.0
        for c in candidates
    }


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
        nice_to_have_skills=job.nice_to_have_skills or [],
        candidate_projects=[
            {"name": p.name, "technologies": p.technologies or []} for p in candidate.projects
        ],
        candidate_certifications=[{"name": c.name} for c in candidate.certifications],
    )


def _apply_result(match: Match, result: scoring.ScoreResult) -> None:
    match.overall_score = result.overall
    match.skills_score = result.dimensions["skills"].score
    match.experience_score = result.dimensions["experience"].score
    match.education_score = result.dimensions["education"].score
    match.semantic_score = result.dimensions["semantic"].score
    match.location_score = result.dimensions["location"].score
    match.projects_score = result.dimensions["projects"].score
    match.certifications_score = result.dimensions["certifications"].score
    match.explanation = result.explanation()


def _upsert_match(
    db: Session, job: Job, candidate: Candidate, result: scoring.ScoreResult,
    existing: dict[int, Match] | None = None,
) -> Match:
    match = existing.get(candidate.id) if existing is not None else db.scalar(
        select(Match).where(Match.job_id == job.id, Match.candidate_id == candidate.id)
    )
    if match is None:
        match = Match(job_id=job.id, candidate_id=candidate.id)
    _apply_result(match, result)
    db.add(match)
    return match


def has_resume(candidate: Candidate) -> bool:
    """Profiles created at registration stay empty until a resume is uploaded."""
    return bool((candidate.resume_text or "").strip())


_COMMIT_ATTEMPTS = 3


def rescore_job(db: Session, job: Job) -> int:
    """Re-score every eligible candidate against one job. Returns the number scored.

    Eligible = the job's own organisation's uploads, plus the talent pool for
    active jobs (see tenancy.eligible_candidates_clause). Matches for anyone
    who stopped being eligible (job closed, candidate deleted/moved) are
    dropped so a tenant never keeps a row pointing at someone it can't see.

    Two ingestion workers (or a worker and a request) can rescore the same job
    at once and both try to INSERT the same (job, candidate) row; the unique
    constraint rejects the loser. That is expected, so the whole pass is simply
    retried — the second time the rows exist and are updated instead.
    """
    ensure_job_embedding(db, job)
    for attempt in range(1, _COMMIT_ATTEMPTS + 1):
        try:
            return _rescore_job_once(db, job)
        except IntegrityError:
            db.rollback()
            if attempt == _COMMIT_ATTEMPTS:
                raise
            logger.info("Concurrent rescore of job %s collided; retrying.", job.id)
    return 0  # pragma: no cover - loop always returns or raises


def _rescore_job_once(db: Session, job: Job) -> int:
    pool = list(db.scalars(select(Candidate).where(tenancy.eligible_candidates_clause(job))))
    candidates = [c for c in pool if has_resume(c)]
    keep_ids = {c.id for c in candidates}

    existing = {m.candidate_id: m for m in db.scalars(select(Match).where(Match.job_id == job.id))}
    stale = [cid for cid in existing if cid not in keep_ids]
    if stale:
        db.execute(delete(Match).where(Match.job_id == job.id, Match.candidate_id.in_(stale)))
        for cid in stale:
            existing.pop(cid)
    if not candidates:
        db.commit()
        return 0

    semantic = _semantic_scores(job, candidates, corpus=candidates)
    for candidate in candidates:
        result = score_pair(job, candidate, semantic.get(candidate.id, 0.0))
        _upsert_match(db, job, candidate, result, existing)
    db.commit()
    logger.info("Re-scored %d candidates for job %s", len(candidates), job.id)
    return len(candidates)


def jobs_for_candidate(db: Session, candidate: Candidate) -> list[Job]:
    return list(db.scalars(select(Job).where(tenancy.eligible_jobs_clause(candidate))))


def rescore_candidate_everywhere(db: Session, candidate: Candidate) -> int:
    """Score one candidate against every job they are eligible for.

    A full `rescore_job` per job (rather than scoring only this candidate)
    keeps each job's TF-IDF vector space fitted over the same corpus, so a
    score never depends on whether it was computed right after upload or by a
    later rescore. Batch ingestion avoids repeating this per file: see
    `rescore_jobs` and the pipeline's batched flush.
    """
    if not has_resume(candidate):
        return 0
    jobs = jobs_for_candidate(db, candidate)
    for job in jobs:
        rescore_job(db, job)
    return len(jobs)


def rescore_jobs(db: Session, job_ids: set[int]) -> int:
    """Rescore each of these jobs exactly once."""
    count = 0
    for job_id in sorted(job_ids):
        job = db.get(Job, job_id)
        if job is not None:
            rescore_job(db, job)
            count += 1
    return count


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
            "projects": match.projects_score,
            "certifications": match.certifications_score,
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
