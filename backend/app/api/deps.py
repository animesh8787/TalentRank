"""Shared FastAPI dependencies: current user, role guards, audit helper."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.firebase import FirebaseClaims, FirebaseNotConfigured, verify_id_token
from app.models import AuditEvent, User, UserRole

_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

_NOT_REGISTERED_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="This Firebase account has no TalentRank profile yet. Call /auth/register first.",
)


def get_firebase_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> FirebaseClaims:
    """Verify the bearer token against Firebase. Does not require a local User row."""
    if credentials is None or not credentials.credentials:
        raise _CREDENTIALS_ERROR

    try:
        claims = verify_id_token(credentials.credentials)
    except FirebaseNotConfigured as exc:
        # A config problem, not an auth problem — worth a distinct message so
        # it isn't mistaken for a bad token during setup.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    if claims is None:
        raise _CREDENTIALS_ERROR
    return claims


def get_current_user(
    claims: FirebaseClaims = Depends(get_firebase_claims),
    db: Session = Depends(get_db),
) -> User:
    """The full guard: valid Firebase token AND an existing TalentRank profile."""
    user = db.scalar(select(User).where(User.firebase_uid == claims.uid))
    if user is None or not user.is_active:
        raise _NOT_REGISTERED_ERROR
    return user


def require_roles(*roles: UserRole):
    """Route guard factory: `Depends(require_roles(UserRole.RECRUITER))`."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        # Admins are implicitly allowed everywhere.
        if user.role is UserRole.ADMIN or user.role in roles:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires one of: {', '.join(r.value for r in roles)}.",
        )

    return dependency


require_staff = require_roles(UserRole.RECRUITER, UserRole.ADMIN)


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    summary: str,
    detail: dict | None = None,
) -> None:
    """Append to the audit trail. Never raises — logging must not break a request."""
    try:
        db.add(AuditEvent(
            actor_id=actor.id if actor else None,
            actor_name=actor.full_name if actor else "system",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            detail=detail,
        ))
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def anonymized_requested(request: Request) -> bool:
    """Read the bias-reduced review toggle from a header or query parameter."""
    header = (request.headers.get("X-Anonymized-Review") or "").strip().lower()
    query = (request.query_params.get("anonymized") or "").strip().lower()
    return header in {"1", "true", "yes"} or query in {"1", "true", "yes"}
