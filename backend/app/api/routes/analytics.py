"""Hiring analytics and the audit trail."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_staff
from app.core.database import get_db
from app.models import (
    AuditEvent,
    Candidate,
    Job,
    Match,
    PipelineStage,
    ProcessingStatus,
    Skill,
    Upload,
    User,
)
from app.schemas import AnalyticsOut, AuditEventOut, SkillGap
from app.services import taxonomy as tx

router = APIRouter(tags=["analytics"])

_SCORE_BANDS = [
    ("0-20%", 0.0, 0.2), ("20-40%", 0.2, 0.4), ("40-60%", 0.4, 0.6),
    ("60-80%", 0.6, 0.8), ("80-100%", 0.8, 1.01),
]
_EXPERIENCE_BANDS = [
    ("0-2 yrs", 0, 2), ("2-5 yrs", 2, 5), ("5-8 yrs", 5, 8),
    ("8-12 yrs", 8, 12), ("12+ yrs", 12, 100),
]


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(
    job_id: int | None = Query(None, description="Scope the numbers to one role"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> AnalyticsOut:
    total_candidates = db.scalar(select(func.count(Candidate.id))) or 0
    total_jobs = db.scalar(select(func.count(Job.id))) or 0

    match_filter = [Match.job_id == job_id] if job_id else []
    total_matches = db.scalar(select(func.count(Match.id)).where(*match_filter)) or 0
    average_score = float(
        db.scalar(select(func.avg(Match.overall_score)).where(*match_filter)) or 0.0
    )

    since = datetime.now(timezone.utc) - timedelta(days=1)
    processed_today = db.scalar(
        select(func.count(Upload.id)).where(
            Upload.created_at >= since, Upload.status == ProcessingStatus.DONE
        )
    ) or 0

    # Score distribution ------------------------------------------------------
    score_distribution = []
    for label, low, high in _SCORE_BANDS:
        count = db.scalar(
            select(func.count(Match.id)).where(
                Match.overall_score >= low, Match.overall_score < high, *match_filter
            )
        ) or 0
        score_distribution.append({"band": label, "count": int(count)})

    # Pipeline funnel ---------------------------------------------------------
    pipeline_funnel = []
    for stage in PipelineStage:
        count = db.scalar(
            select(func.count(Match.id)).where(Match.stage == stage, *match_filter)
        ) or 0
        pipeline_funnel.append({
            "stage": stage.value,
            "label": stage.value.replace("_", " ").title(),
            "count": int(count),
        })

    # Skill supply vs demand --------------------------------------------------
    top_skill_rows = db.execute(
        select(Skill.name, func.count(func.distinct(Skill.candidate_id)))
        .group_by(Skill.name)
        .order_by(func.count(func.distinct(Skill.candidate_id)).desc())
        .limit(15)
    ).all()
    top_skills = [{"skill": name, "count": int(count)} for name, count in top_skill_rows]

    required: set[str] = set()
    job_scope = select(Job).where(Job.id == job_id) if job_id else select(Job)
    for job in db.scalars(job_scope):
        required.update(tx.canonical_skill(s) for s in (job.required_skills or []))

    skill_gaps: list[SkillGap] = []
    for skill in sorted(required):
        supply = db.scalar(
            select(func.count(func.distinct(Skill.candidate_id))).where(Skill.name == skill)
        ) or 0
        skill_gaps.append(SkillGap(
            skill=skill,
            required=True,
            supply=int(supply),
            supply_pct=round(100 * supply / total_candidates, 1) if total_candidates else 0.0,
        ))
    skill_gaps.sort(key=lambda g: g.supply_pct)

    # Experience spread -------------------------------------------------------
    experience_distribution = []
    for label, low, high in _EXPERIENCE_BANDS:
        count = db.scalar(
            select(func.count(Candidate.id)).where(
                Candidate.total_experience >= low, Candidate.total_experience < high
            )
        ) or 0
        experience_distribution.append({"band": label, "count": int(count)})

    total_uploads = db.scalar(select(func.count(Upload.id))) or 0
    done_uploads = db.scalar(
        select(func.count(Upload.id)).where(Upload.status == ProcessingStatus.DONE)
    ) or 0

    return AnalyticsOut(
        total_candidates=int(total_candidates),
        total_jobs=int(total_jobs),
        total_matches=int(total_matches),
        processed_today=int(processed_today),
        average_score=round(average_score, 4),
        score_distribution=score_distribution,
        pipeline_funnel=pipeline_funnel,
        skill_gaps=skill_gaps[:12],
        top_skills=top_skills,
        experience_distribution=experience_distribution,
        upload_success_rate=round(100 * done_uploads / total_uploads, 1) if total_uploads else 0.0,
    )


@router.get("/audit", response_model=list[AuditEventOut])
def audit_log(
    limit: int = Query(100, le=500),
    action: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
) -> list[AuditEventOut]:
    statement = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if action:
        statement = statement.where(AuditEvent.action == action)
    return [AuditEventOut.model_validate(e) for e in db.scalars(statement)]
