"""Candidate browsing, detail, self-service correction and health report."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import anonymized_requested, get_current_user, record_audit, require_staff
from app.core.database import get_db
from app.models import Candidate, Certification, Education, Job, JobStatus, Match, Project, Skill, User, UserRole, WorkExperience
from app.schemas import (
    CandidateDetail,
    CandidateOut,
    CandidateUpdate,
    RecommendationOut,
    RoleMatchOut,
    SkillGapItem,
)
from app.services import anonymize, ranking, recommendations, taxonomy as tx

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _serialise(candidate: Candidate, *, detail: bool, anonymized: bool):
    model = CandidateDetail if detail else CandidateOut
    payload = model.model_validate(candidate).model_dump()
    if anonymized:
        payload = anonymize.anonymize_candidate(payload)
    return model.model_validate(payload)


def _get_or_404(db: Session, candidate_id: int) -> Candidate:
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return candidate


@router.get("", response_model=list[CandidateOut])
def list_candidates(
    request: Request,
    search: str | None = None,
    skills: str | None = Query(None, description="Comma-separated skill filter"),
    min_experience: float | None = None,
    max_experience: float | None = None,
    education: str | None = None,
    location: str | None = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> list[CandidateOut]:
    statement = select(Candidate)

    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Candidate.full_name.ilike(pattern),
                Candidate.email.ilike(pattern),
                Candidate.headline.ilike(pattern),
                Candidate.resume_text.ilike(pattern),
            )
        )
    if min_experience is not None:
        statement = statement.where(Candidate.total_experience >= min_experience)
    if max_experience is not None:
        statement = statement.where(Candidate.total_experience <= max_experience)
    if education:
        statement = statement.where(Candidate.highest_qualification == education)
    if location:
        statement = statement.where(Candidate.location.ilike(f"%{location.strip()}%"))

    if skills:
        wanted = [tx.canonical_skill(s) for s in skills.split(",") if s.strip()]
        for skill_name in wanted:
            # Require every requested skill, not merely one of them.
            statement = statement.where(
                Candidate.id.in_(select(Skill.candidate_id).where(Skill.name == skill_name))
            )

    statement = statement.order_by(Candidate.created_at.desc()).offset(offset).limit(limit)
    anonymized = anonymized_requested(request)
    return [
        _serialise(c, detail=False, anonymized=anonymized) for c in db.scalars(statement)
    ]


@router.get("/filters")
def filter_options(
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> dict:
    """Populate the filter dropdowns from what is actually in the database."""
    skills = db.execute(
        select(Skill.name, func.count(Skill.id).label("n"))
        .group_by(Skill.name)
        .order_by(func.count(Skill.id).desc())
        .limit(60)
    ).all()
    educations = db.scalars(
        select(Candidate.highest_qualification)
        .where(Candidate.highest_qualification.is_not(None))
        .distinct()
    ).all()
    locations = db.scalars(
        select(Candidate.location).where(Candidate.location.is_not(None)).distinct().limit(60)
    ).all()
    return {
        "skills": [{"name": name, "count": count} for name, count in skills],
        "educations": sorted(e for e in educations if e),
        "locations": sorted(loc for loc in locations if loc),
    }


@router.get("/me", response_model=CandidateDetail)
def my_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateDetail:
    """The candidate self-service view of their own parsed data."""
    candidate = db.scalar(select(Candidate).where(Candidate.user_id == user.id))
    # The profile made at registration is empty until a resume is processed.
    if candidate is None or not ranking.has_resume(candidate):
        raise HTTPException(
            status_code=404,
            detail="No resume on file yet. Upload one to see how it was read.",
        )
    return CandidateDetail.model_validate(candidate)


def _skill_gap_status(kind: str, similarity: float) -> str:
    if kind == "missing":
        return "missing"
    if kind in ("exact", "alias"):
        return "strong"
    return "strong" if similarity >= 0.85 else "developing"  # semantic


def _build_skill_gap(explanation: dict) -> list[SkillGapItem]:
    """Required + preferred matches/misses from a Match.explanation, unified
    into one gap list a candidate can act on."""
    items: list[SkillGapItem] = []
    for m in explanation.get("matched_skills") or []:
        items.append(SkillGapItem(
            skill=m["required"], required=True,
            status=_skill_gap_status(m.get("kind", "missing"), m.get("similarity") or 0.0),
            similarity=m.get("similarity") or 0.0, evidence=m.get("evidence"),
        ))
    for name in explanation.get("missing_skills") or []:
        items.append(SkillGapItem(skill=name, required=True, status="missing", similarity=0.0))
    for m in explanation.get("preferred_matched") or []:
        items.append(SkillGapItem(
            skill=m["required"], required=False,
            status=_skill_gap_status(m.get("kind", "missing"), m.get("similarity") or 0.0),
            similarity=m.get("similarity") or 0.0, evidence=m.get("evidence"),
        ))
    for name in explanation.get("preferred_missing") or []:
        items.append(SkillGapItem(skill=name, required=False, status="missing", similarity=0.0))
    return items


@router.get("/me/matches", response_model=list[RoleMatchOut])
def my_matches(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RoleMatchOut]:
    """"Roles you match" — every active role this candidate has been scored
    against, using the exact same Match rows and scorer output recruiters
    see, reshaped for the candidate: score, why, the skill gap for that
    role, and concrete next steps. No separate matching system.
    """
    candidate = db.scalar(select(Candidate).where(Candidate.user_id == user.id))
    if candidate is None or not ranking.has_resume(candidate):
        raise HTTPException(
            status_code=404,
            detail="No resume on file yet. Upload one to see which roles you match.",
        )

    rows = db.execute(
        select(Match, Job)
        .join(Job, Match.job_id == Job.id)
        .where(Match.candidate_id == candidate.id, Job.status == JobStatus.ACTIVE)
        .order_by(Match.overall_score.desc())
    ).all()

    results: list[RoleMatchOut] = []
    for match, job in rows:
        explanation = match.explanation or {}
        recs = recommendations.build_recommendations(candidate, job, explanation)
        results.append(RoleMatchOut(
            job=job,
            overall_score=match.overall_score,
            dimensions=explanation.get("dimensions", {}),
            summary=explanation.get("summary", ""),
            matched_skills=explanation.get("matched_skills", []),
            missing_skills=explanation.get("missing_skills", []),
            preferred_matched=explanation.get("preferred_matched", []),
            preferred_missing=explanation.get("preferred_missing", []),
            skill_gap=_build_skill_gap(explanation),
            recommendations=[RecommendationOut(**r) for r in recs],
        ))
    return results


@router.get("/{candidate_id}", response_model=CandidateDetail)
def get_candidate(
    candidate_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateDetail:
    candidate = _get_or_404(db, candidate_id)
    if user.role is UserRole.CANDIDATE and candidate.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your profile.")
    return _serialise(candidate, detail=True, anonymized=anonymized_requested(request))


@router.patch("/{candidate_id}", response_model=CandidateDetail)
def update_candidate(
    candidate_id: int,
    payload: CandidateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateDetail:
    """Correct mis-parsed fields. Candidates may edit only their own record."""
    candidate = _get_or_404(db, candidate_id)
    if user.role is UserRole.CANDIDATE:
        if candidate.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not your profile.")
        candidate.verified_by_candidate = True

    data = payload.model_dump(exclude_unset=True)
    skills = data.pop("skills", None)
    experiences = data.pop("experiences", None)
    educations = data.pop("educations", None)
    projects = data.pop("projects", None)
    certifications = data.pop("certifications", None)
    for key, value in data.items():
        setattr(candidate, key, value)

    if skills is not None:
        names = list(dict.fromkeys(tx.canonical_skill(s) for s in skills if s.strip()))
        # Clear and flush before inserting the replacements — assigning a
        # fresh list straight onto the relationship lets SQLAlchemy emit the
        # INSERTs before the orphan DELETEs within one flush, which trips the
        # (candidate_id, name) unique constraint whenever a name is kept
        # (see pipeline._clear_children, which handles the same pattern for
        # skills parsed from an upload).
        candidate.skills.clear()
        db.flush()
        candidate.skills = [
            Skill(
                name=name,
                category=tx.SKILL_TO_CATEGORY.get(name, "other"),
                proficiency="Self-reported",
                confidence=1.0,
                evidence="Confirmed by the candidate.",
            )
            for name in names
        ]

    # Same clear-then-flush-then-replace pattern as skills above, applied
    # consistently to every candidate-editable list so none of them can hit
    # the same insert-before-delete ordering issue.
    if experiences is not None:
        candidate.experiences.clear()
        db.flush()
        candidate.experiences = [WorkExperience(**item) for item in experiences]

    if educations is not None:
        candidate.educations.clear()
        db.flush()
        candidate.educations = [Education(**item) for item in educations]
        # Keep the scalar "highest qualification" summary in sync unless the
        # request already set it explicitly in this same call.
        if "highest_qualification" not in data:
            best_rank, best_label = 0, None
            for item in educations:
                rank = tx.education_rank(item.get("degree"))
                if rank > best_rank:
                    best_rank, best_label = rank, item.get("degree")
            if best_label:
                candidate.highest_qualification = best_label

    if projects is not None:
        candidate.projects.clear()
        db.flush()
        candidate.projects = [Project(**item) for item in projects]

    if certifications is not None:
        candidate.certifications.clear()
        db.flush()
        candidate.certifications = [Certification(**item) for item in certifications]

    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Corrected facts change the score, so refresh every match for this person.
    ranking.rescore_candidate_everywhere(db, candidate)
    record_audit(
        db, actor=user, action="candidate.update", entity_type="candidate",
        entity_id=candidate.id,
        summary=f"Updated candidate #{candidate.id}", detail=data,
    )
    return CandidateDetail.model_validate(candidate)


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
) -> None:
    candidate = _get_or_404(db, candidate_id)
    name = candidate.full_name or f"#{candidate_id}"
    db.delete(candidate)
    db.commit()
    record_audit(
        db, actor=user, action="candidate.delete", entity_type="candidate",
        entity_id=candidate_id, summary=f"Deleted candidate {name}",
    )


@router.get("/{candidate_id}/duplicates", response_model=list[CandidateOut])
def find_duplicates(
    candidate_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[CandidateOut]:
    """Other records that look like the same person."""
    candidate = _get_or_404(db, candidate_id)
    conditions = []
    if candidate.email:
        conditions.append(Candidate.email == candidate.email)
    if candidate.phone:
        conditions.append(Candidate.phone == candidate.phone)
    if candidate.content_hash:
        conditions.append(Candidate.content_hash == candidate.content_hash)
    if not conditions:
        return []

    statement = select(Candidate).where(Candidate.id != candidate_id, or_(*conditions))
    return [CandidateOut.model_validate(c) for c in db.scalars(statement)]
