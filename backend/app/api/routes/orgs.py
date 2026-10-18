"""Organisations: the invite flow that lets teammates share one workspace."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import record_audit, require_staff
from app.core.database import get_db
from app.models import Organization, User
from app.schemas import InviteCheckOut, OrgOut
from app.services import tenancy

router = APIRouter(prefix="/orgs", tags=["organisations"])


def _out(db: Session, org: Organization) -> OrgOut:
    members = db.scalar(select(func.count(User.id)).where(User.org_id == org.id)) or 0
    return OrgOut(id=org.id, name=org.name, invite_code=org.invite_code, member_count=int(members))


@router.get("/invite/{code}", response_model=InviteCheckOut)
def check_invite(code: str, db: Session = Depends(get_db)) -> InviteCheckOut:
    """Public: lets the sign-up form validate a code *before* a Firebase
    account is created, so a typo cannot leave someone half-registered."""
    org = db.scalar(select(Organization).where(Organization.invite_code == code.strip().upper()))
    return InviteCheckOut(valid=org is not None, org_name=org.name if org else None)


@router.get("/me", response_model=OrgOut)
def my_org(db: Session = Depends(get_db), user: User = Depends(require_staff)) -> OrgOut:
    return _out(db, db.get(Organization, tenancy.ensure_org(db, user)))


@router.post("/me/rotate-code", response_model=OrgOut)
def rotate_code(db: Session = Depends(get_db), user: User = Depends(require_staff)) -> OrgOut:
    """Invalidate the current invite code (e.g. after it leaked)."""
    org = db.get(Organization, tenancy.ensure_org(db, user))
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    org.invite_code = tenancy.new_invite_code()
    db.add(org)
    db.commit()
    record_audit(
        db, actor=user, action="org.rotate_code", entity_type="organization",
        entity_id=org.id, summary="Rotated the team invite code",
    )
    return _out(db, org)
