"""Job description CRUD plus weight tuning."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, record_audit, require_staff
from app.core.database import get_db
from app.models import Job, JobStatus, Match, PipelineStage, User
from app.schemas import JobCreate, JobOut, JobUpdate, JobWeights
from app.services import ranking, taxonomy as tx

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _to_out(db: Session, job: Job) -> JobOut:
    stats = db.execute(
        select(func.count(Match.id), func.avg(Match.overall_score)).where(Match.job_id == job.id)
    ).one()
    shortlisted = db.scalar(
        select(func.count(Match.id)).where(
            Match.job_id == job.id,
            Match.stage.in_([
                PipelineStage.SHORTLISTED, PipelineStage.INTERVIEWING,
                PipelineStage.OFFER, PipelineStage.HIRED,
            ]),
        )
    ) or 0

    data = JobOut.model_validate(job)
    data.weights = JobWeights(**job.weights)
    data.candidate_count = int(stats[0] or 0)
    data.average_score = round(float(stats[1] or 0.0), 4)
    data.shortlisted_count = int(shortlisted)
    return data


def _normalise_skills(skills: list[str] | None) -> list[str]:
    if not skills:
        return []
    cleaned = [tx.canonical_skill(s) for s in skills if s and s.strip()]
    return list(dict.fromkeys(cleaned))


def _get_or_404(db: Session, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


@router.get("", response_model=list[JobOut])
def list_jobs(
    status_filter: JobStatus | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[JobOut]:
    statement = select(Job).order_by(Job.created_at.desc())
    if status_filter:
        statement = statement.where(Job.status == status_filter)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(Job.title.ilike(pattern))
    return [_to_out(db, job) for job in db.scalars(statement)]


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> JobOut:
    job = Job(
        **payload.model_dump(exclude={"weights", "required_skills", "nice_to_have_skills"}),
        required_skills=_normalise_skills(payload.required_skills),
        nice_to_have_skills=_normalise_skills(payload.nice_to_have_skills),
        created_by_id=user.id,
    )
    weights = payload.weights
    job.weight_skills = weights.skills
    job.weight_experience = weights.experience
    job.weight_education = weights.education
    job.weight_semantic = weights.semantic
    job.weight_location = weights.location

    db.add(job)
    db.commit()
    db.refresh(job)

    # Score every existing candidate against the new role immediately.
    ranking.rescore_job(db, job)
    record_audit(
        db, actor=user, action="job.create", entity_type="job",
        entity_id=job.id, summary=f"Created job '{job.title}'",
    )
    return _to_out(db, job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> JobOut:
    return _to_out(db, _get_or_404(db, job_id))


@router.patch("/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    payload: JobUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> JobOut:
    job = _get_or_404(db, job_id)
    data = payload.model_dump(exclude_unset=True)
    weights = data.pop("weights", None)

    # Any change to the matching criteria invalidates the cached embedding.
    if {"title", "description", "required_skills", "nice_to_have_skills",
        "required_education", "department"} & data.keys():
        job.embedding = None

    for field in ("required_skills", "nice_to_have_skills"):
        if field in data:
            data[field] = _normalise_skills(data[field])

    for key, value in data.items():
        setattr(job, key, value)

    if weights:
        job.weight_skills = weights["skills"]
        job.weight_experience = weights["experience"]
        job.weight_education = weights["education"]
        job.weight_semantic = weights["semantic"]
        job.weight_location = weights["location"]

    db.add(job)
    db.commit()
    db.refresh(job)

    ranking.rescore_job(db, job)
    record_audit(
        db, actor=user, action="job.update", entity_type="job",
        entity_id=job.id, summary=f"Updated job '{job.title}'", detail=data,
    )
    return _to_out(db, job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> None:
    job = _get_or_404(db, job_id)
    title = job.title
    db.delete(job)
    db.commit()
    record_audit(
        db, actor=user, action="job.delete", entity_type="job",
        entity_id=job_id, summary=f"Deleted job '{title}'",
    )


@router.post("/{job_id}/rescore", response_model=JobOut)
def rescore(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> JobOut:
    job = _get_or_404(db, job_id)
    job.embedding = None
    count = ranking.rescore_job(db, job)
    record_audit(
        db, actor=user, action="job.rescore", entity_type="job",
        entity_id=job.id, summary=f"Re-scored {count} candidates for '{job.title}'",
    )
    return _to_out(db, job)
