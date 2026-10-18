"""Authentication routes.

Firebase handles the actual login (email/password verification, password
resets, and — trivially, if enabled later — Google/GitHub sign-in) entirely
client-side. This module only ever sees a verified Firebase ID token; it never
sees a password.

/auth/register  — call once, right after Firebase account creation, to
                   provision the matching TalentRank profile (role, name).
/auth/me        — call after every login (and on page load) to fetch that
                   profile. Every other route's auth guard is get_current_user
                   in app.api.deps, which requires this profile to already exist.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import FirebaseClaims, get_current_user, get_firebase_claims, record_audit
from app.core.database import get_db
from app.models import Candidate, Organization, User, UserRole
from app.schemas import RegisterRequest, UserOut
from app.services import tenancy

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    claims: FirebaseClaims = Depends(get_firebase_claims),
    db: Session = Depends(get_db),
) -> UserOut:
    """Provision a TalentRank profile for an already-created Firebase account.

    Idempotent: calling it again for an existing uid just returns the existing
    profile untouched — the role/name in the request body only apply the first
    time, so a user can't re-call this to escalate their own role later.
    """
    existing = db.scalar(select(User).where(User.firebase_uid == claims.uid))
    if existing is not None:
        return UserOut.model_validate(existing)

    if not claims.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This Firebase account has no email address on file.",
        )

    # Self-registration can never grant admin — matches the original guard.
    role = payload.role if payload.role is not UserRole.ADMIN else UserRole.CANDIDATE

    org_id: int | None = None
    if role is UserRole.RECRUITER:
        code = (payload.invite_code or "").strip().upper()
        if code:
            org = db.scalar(select(Organization).where(Organization.invite_code == code))
            if org is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="That invite code is not valid.",
                )
            org_id = org.id
        else:
            full_name = payload.full_name.strip()
            org_id = tenancy.create_organization(
                db, payload.org_name or f"{full_name or 'My'}'s team"
            ).id

    user = User(
        firebase_uid=claims.uid,
        email=claims.email.lower(),
        full_name=payload.full_name.strip() or claims.name or claims.email.split("@")[0],
        role=role,
        org_id=org_id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two register calls raced (double-click, retry after a timeout): the
        # other one won, so hand back what it created instead of a 500.
        db.rollback()
        existing = db.scalar(select(User).where(User.firebase_uid == claims.uid))
        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            ) from None
        return UserOut.model_validate(existing)
    db.refresh(user)

    if user.role is UserRole.CANDIDATE:
        db.add(Candidate(user_id=user.id, full_name=user.full_name, email=user.email))
        db.commit()

    record_audit(
        db, actor=user, action="user.register", entity_type="user",
        entity_id=user.id, summary=f"{user.email} registered as {user.role.value}",
    )
    return UserOut.model_validate(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
