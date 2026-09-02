"""Shared FastAPI dependencies: current user, role guards, audit helper."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models import AuditEvent, User, UserRole

_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _CREDENTIALS_ERROR

    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise _CREDENTIALS_ERROR

    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise _CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_ERROR
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
