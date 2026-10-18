"""Multi-tenancy rules, in one place.

Ownership model
---------------
* A recruiter belongs to one `Organization`. Jobs, uploads, notes, audit events
  and the candidates a team uploads are owned by that organisation.
* A candidate who registers themselves has `org_id = NULL`: they are in the
  shared talent pool. A recruiter sees such a candidate only while the
  candidate has a match against one of the recruiter's *active* jobs — the
  consent text shown at candidate sign-up says exactly that.
* Admins are platform-wide and are never filtered.

Every query that returns candidates, jobs, matches, uploads or audit rows for
staff goes through the helpers below so the rule is not re-implemented (and
forgotten) route by route.
"""
from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Candidate,
    Job,
    JobStatus,
    Match,
    Organization,
    Upload,
    User,
    UserRole,
)


def new_invite_code() -> str:
    return secrets.token_hex(6).upper()


def create_organization(db: Session, name: str) -> Organization:
    org = Organization(name=name.strip()[:255] or "My team", invite_code=new_invite_code())
    db.add(org)
    db.flush()
    return org


def ensure_org(db: Session, user: User) -> int:
    """The user's organisation id, creating a personal one on first need.

    Recruiters always have one after registration/backfill; this exists for
    admins, who are not registered through the recruiter flow but may still
    create jobs and upload resumes.
    """
    if user.org_id is None:
        org = create_organization(db, f"{user.full_name}'s team")
        user.org_id = org.id
        db.add(user)
        db.commit()
    return user.org_id


def org_scope(user: User) -> int | None:
    """The organisation a staff request is confined to; None means unrestricted.

    A recruiter without an organisation cannot see anything (fail closed).
    """
    if user.role is UserRole.ADMIN:
        return None
    if user.org_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not part of an organisation yet.",
        )
    return user.org_id


# --------------------------------------------------------------------------- #
# Candidate visibility
# --------------------------------------------------------------------------- #
def visible_candidates_clause(org_id: int | None):
    """SQL predicate: candidates this organisation may see. None = everyone."""
    if org_id is None:
        return Candidate.id.is_not(None)
    in_active_job = exists().where(
        Match.candidate_id == Candidate.id,
        Match.job_id == Job.id,
        Job.org_id == org_id,
        Job.status == JobStatus.ACTIVE,
    )
    return or_(
        Candidate.org_id == org_id,
        and_(Candidate.org_id.is_(None), in_active_job),
    )


def candidate_visible(db: Session, user: User, candidate: Candidate) -> bool:
    org_id = org_scope(user)
    if org_id is None:
        return True
    return db.scalar(
        select(Candidate.id).where(Candidate.id == candidate.id, visible_candidates_clause(org_id))
    ) is not None


def candidate_owned(user: User, candidate: Candidate) -> bool:
    """Staff may edit/delete only what their organisation uploaded (admin: all)."""
    org_id = org_scope(user)
    return org_id is None or candidate.org_id == org_id


def eligible_candidates_clause(job: Job):
    """Candidates a job may be scored against: its own organisation's uploads,
    plus the talent pool for active jobs."""
    own = Candidate.org_id == job.org_id
    if job.status is JobStatus.ACTIVE:
        return or_(own, Candidate.org_id.is_(None))
    return own


def eligible_jobs_clause(candidate: Candidate):
    """Jobs a candidate may be scored against (never a closed job)."""
    if candidate.org_id is None:
        return Job.status == JobStatus.ACTIVE
    return and_(Job.org_id == candidate.org_id, Job.status != JobStatus.CLOSED)


# --------------------------------------------------------------------------- #
# Loaders that 404 instead of revealing other tenants' rows exist
# --------------------------------------------------------------------------- #
def get_job(db: Session, user: User, job_id: int) -> Job:
    job = db.get(Job, job_id)
    org_id = org_scope(user)
    if job is None or (org_id is not None and job.org_id != org_id):
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def get_match(db: Session, user: User, match_id: int) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    org_id = org_scope(user)
    if org_id is not None and match.job.org_id != org_id:
        raise HTTPException(status_code=404, detail="Match not found.")
    return match


def get_candidate(db: Session, user: User, candidate_id: int) -> Candidate:
    candidate = db.get(Candidate, candidate_id)
    if candidate is None or not candidate_visible(db, user, candidate):
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return candidate


def can_access_upload(db: Session, user: User, upload: Upload) -> bool:
    if user.role is UserRole.CANDIDATE:
        return upload.uploaded_by_id == user.id
    org_id = org_scope(user)
    if org_id is None or upload.org_id == org_id:
        return True
    # A pool candidate's own upload is reachable only while that candidate is
    # visible to this organisation.
    if upload.candidate_id is not None:
        candidate = db.get(Candidate, upload.candidate_id)
        return candidate is not None and candidate_visible(db, user, candidate)
    return False


# --------------------------------------------------------------------------- #
# Blind review (server enforced)
# --------------------------------------------------------------------------- #
def blind_candidate_ids(db: Session, org_id: int | None) -> set[int]:
    """Candidates matched to at least one blind-review job in this scope."""
    statement = (
        select(Match.candidate_id)
        .join(Job, Job.id == Match.job_id)
        .where(Job.blind_review.is_(True))
        .distinct()
    )
    if org_id is not None:
        statement = statement.where(Job.org_id == org_id)
    return set(db.scalars(statement))


def org_has_blind_job(db: Session, org_id: int | None) -> bool:
    statement = select(Job.id).where(Job.blind_review.is_(True)).limit(1)
    if org_id is not None:
        statement = statement.where(Job.org_id == org_id)
    return db.scalar(statement) is not None
