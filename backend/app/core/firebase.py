"""Firebase Admin SDK wiring: verifies ID tokens minted by the frontend.

The frontend authenticates the user directly against Firebase (email/password,
and trivially extendable to Google/GitHub) and sends the resulting ID token as
a normal `Authorization: Bearer <token>` header. This module's only job is to
verify that token server-side and hand back the claims inside it — it never
sees a password.

Initialisation is lazy: importing this module must never crash just because
the credentials file isn't there yet (e.g. `python -m app.seed` shouldn't need
Firebase configured). The error only surfaces when a token actually needs
verifying, as a clear message rather than a crash at import time.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

from app.core.config import settings

logger = logging.getLogger(__name__)

_app = None
_app_lock = threading.Lock()
_init_error: str | None = None


class FirebaseNotConfigured(RuntimeError):
    """Raised when a token needs verifying but no credentials file exists."""


def _get_app():
    global _app, _init_error
    if _app is not None or _init_error is not None:
        return _app

    with _app_lock:
        if _app is not None or _init_error is not None:
            return _app

        import firebase_admin
        from firebase_admin import credentials

        # Raw JSON in an env var takes priority — that's how hosts whose
        # blueprints can set env vars but can't provision a secret file
        # (Render, for one) are configured. A local file is the normal path.
        if settings.firebase_credentials_json:
            try:
                import json

                cert_info = json.loads(settings.firebase_credentials_json)
            except ValueError as exc:
                _init_error = f"FIREBASE_CREDENTIALS_JSON is not valid JSON: {exc}"
                logger.warning(_init_error)
                return None
            cred = credentials.Certificate(cert_info)
        elif settings.firebase_credentials_file.is_file():
            cred = credentials.Certificate(str(settings.firebase_credentials_file))
        else:
            _init_error = (
                f"No Firebase credentials configured. Either save your service "
                f"account key to {settings.firebase_credentials_file} (download "
                f"it from Firebase: Project settings > Service accounts > "
                f"Generate new private key), or set FIREBASE_CREDENTIALS_JSON to "
                f"its raw content."
            )
            logger.warning(_init_error)
            return None

        _app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialised.")
    return _app


@dataclass(frozen=True)
class FirebaseClaims:
    uid: str
    email: str | None
    name: str | None
    email_verified: bool


def verify_id_token(token: str) -> FirebaseClaims | None:
    """Verify a Firebase ID token. Returns None if it's invalid or expired."""
    app = _get_app()
    if app is None:
        raise FirebaseNotConfigured(_init_error or "Firebase is not configured.")

    from firebase_admin import auth as firebase_auth

    try:
        decoded = firebase_auth.verify_id_token(token, app=app)
    except Exception as exc:  # noqa: BLE001 - any verification failure means "not authenticated"
        logger.info("Firebase token rejected: %s", exc)
        return None

    return FirebaseClaims(
        uid=decoded["uid"],
        email=decoded.get("email"),
        name=decoded.get("name"),
        email_verified=bool(decoded.get("email_verified", False)),
    )
