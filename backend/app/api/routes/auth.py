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
from sqlalchemy.orm import Session

from app.api.deps import FirebaseClaims, get_current_user, get_firebase_claims, record_audit
from app.core.database import get_db
from app.models import Candidate, User, UserRole
from app.schemas import RegisterRequest, UserOut

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

    user = User(
        firebase_uid=claims.uid,
        email=claims.email.lower(),
        full_name=payload.full_name.strip() or claims.name or claims.email.split("@")[0],
        role=role,
    )
    db.add(user)
    db.commit()
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
