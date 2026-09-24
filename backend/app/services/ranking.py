"""Persistence layer around the scorer.

Keeps `matches` rows in sync whenever a candidate is ingested, a job is edited,
or a recruiter drags the weight sliders.
"""
from __future__ import annotations

import logging

from sqlalchemy import delete, select
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
    match.projects_score = result.dimensions["projects"].score
    match.certifications_score = result.dimensions["certifications"].score
    match.explanation = result.explanation()
    db.add(match)
    return match


def has_resume(candidate: Candidate) -> bool:
    """Profiles created at registration stay empty until a resume is uploaded."""
    return bool((candidate.resume_text or "").strip())


def rescore_job(db: Session, job: Job) -> int:
    """Re-score every candidate against one job. Returns the number scored."""
    ensure_job_embedding(db, job)
    everyone = list(db.scalars(select(Candidate)))
    candidates = [c for c in everyone if has_resume(c)]

    # An empty profile has nothing to rank, so drop any match it was given.
    empty_ids = [c.id for c in everyone if not has_resume(c)]
    if empty_ids:
        db.execute(
            delete(Match).where(Match.job_id == job.id, Match.candidate_id.in_(empty_ids))
        )
    if not candidates:
        db.commit()
        return 0

    semantic = _semantic_scores(job, candidates, corpus=candidates)
    for candidate in candidates:
        result = score_pair(job, candidate, semantic.get(candidate.id, 0.0))
        _upsert_match(db, job, candidate, result)
    db.commit()
    logger.info("Re-scored %d candidates for job %s", len(candidates), job.id)
    return len(candidates)


def rescore_candidate_everywhere(db: Session, candidate: Candidate) -> int:
    """Score one candidate against every open job — used after ingestion.

    Without an embedding model (the free-tier default), the TF-IDF fallback's
    vector space is fit fresh from whichever candidates are passed in. Scoring
    only the new candidate here would fit it alone against the job — a
    two-document fit — while a later full rescore fits over everyone,
    landing on a different score for the same resume. Doing a full
    `rescore_job` instead keeps every match for a job fit over the same
    corpus, so a score never depends on whether it was computed right after
    upload or by a later rescore.

    When embeddings are enabled this is more work than scoring just the one
    candidate, but cosine similarity against a job's cached embedding is
    cheap and doesn't drift, so the correctness cost is TF-IDF-only.
    """
    if not has_resume(candidate):
        return 0
    jobs = list(db.scalars(select(Job).where(Job.status != JobStatus.CLOSED)))
    for job in jobs:
        rescore_job(db, job)
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
