"""Test harness: throwaway SQLite DB, Firebase replaced by a header, no workers.

Environment is set *before* the app is imported because `app.core.config`
reads it at import time.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="talentrank-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["STORAGE_DIR"] = str(_TMP / "resumes")
os.environ["EMBEDDINGS_ENABLED"] = "false"
os.environ.pop("HF_TOKEN", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi import HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_firebase_claims  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.firebase import FirebaseClaims  # noqa: E402
from app.core.migrations import sync_schema  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Candidate, Skill  # noqa: E402
from app.services import pipeline  # noqa: E402


def _fake_claims(request: Request) -> FirebaseClaims:
    uid = request.headers.get("X-Test-Uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return FirebaseClaims(uid=uid, email=f"{uid}@example.com", name=uid, email_verified=True)


@pytest.fixture()
def client(monkeypatch):
    Base.metadata.drop_all(engine)
    sync_schema(engine)
    # Uploads are processed synchronously by the tests that need it.
    monkeypatch.setattr(pipeline, "enqueue", lambda ids: None)
    app.dependency_overrides[get_firebase_claims] = _fake_claims
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


def hdr(uid: str) -> dict[str, str]:
    return {"X-Test-Uid": uid}


def register(client: TestClient, uid: str, role: str = "recruiter", **extra) -> dict:
    response = client.post(
        "/api/auth/register",
        json={"full_name": uid.title(), "role": role, **extra},
        headers=hdr(uid),
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def make_candidate(db, *, org_id=None, user_id=None, name="Jane Doe", skills=("python", "sql")) -> int:
    candidate = Candidate(
        org_id=org_id,
        user_id=user_id,
        full_name=name,
        email=f"{name.split()[0].lower()}@example.com",
        phone="+919999999999",
        location="Bengaluru",
        total_experience=5,
        highest_qualification="Bachelors",
        resume_text=f"{name}\nPython and SQL engineer with 5 years experience. Contact {name.lower().replace(' ', '.')}@example.com",
        source_filename=f"{name.replace(' ', '_')}_Resume.pdf",
    )
    candidate.skills = [Skill(name=s, category="programming", confidence=0.9) for s in skills]
    db.add(candidate)
    db.commit()
    return candidate.id


def create_job(client: TestClient, uid: str, title="Backend Engineer", **extra) -> dict:
    response = client.post(
        "/api/jobs",
        json={"title": title, "required_skills": ["python", "sql"], "required_experience": 3,
              "location": "Bengaluru", **extra},
        headers=hdr(uid),
    )
    assert response.status_code == 201, response.text
    return response.json()
