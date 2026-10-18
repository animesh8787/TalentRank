"""Ingestion: parsing, per-org de-duplication, batching, restarts, migration."""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app import eval_parsing
from app.core.config import BACKEND_DIR, settings
from app.core.migrations import backfill_organizations, sync_schema
from app.models import Base, Candidate, Job, Match, Organization, ProcessingStatus, Upload, User, UserRole
from app.services import extraction, pipeline, ranking

from .conftest import create_job, hdr, register

PRIYA = BACKEND_DIR / "samples" / "resumes" / "priya_nair.txt"


def _queue_upload(db, org_id, uploader_id, name="priya.txt") -> int:
    stored = settings.storage_dir / f"{org_id}-{uploader_id}-{name}"
    shutil.copy(PRIYA, stored)
    upload = Upload(
        original_filename=name, stored_filename=str(stored), org_id=org_id,
        uploaded_by_id=uploader_id, status=ProcessingStatus.QUEUED,
    )
    db.add(upload)
    db.commit()
    return upload.id


def test_sample_resumes_parse_as_expected():
    rows = eval_parsing.evaluate()
    misses = [r for r in rows if not r[2]]
    assert not misses, misses


def test_projects_and_certifications_are_parsed_stored_and_scored(client, db):
    org = register(client, "alice", org_name="Acme")
    job = create_job(client, "alice")
    upload_id = _queue_upload(db, org["org_id"], org["id"])

    pipeline.process_upload(upload_id)

    candidate = db.scalar(select(Candidate))
    assert candidate.org_id == org["org_id"]
    assert {p.name for p in candidate.projects} == {"Churn Predictor", "Resume Screener"}
    assert {c.name for c in candidate.certifications} >= {"Deep Learning Specialization"}
    match = db.scalar(select(Match).where(Match.job_id == job["id"]))
    assert match.projects_score > 0 and match.certifications_score > 0
    assert db.get(Upload, upload_id).status is ProcessingStatus.DONE
    assert candidate.latest_upload_id == upload_id


def test_reprocessing_replaces_children_instead_of_duplicating(client, db):
    org = register(client, "alice", org_name="Acme")
    upload_id = _queue_upload(db, org["org_id"], org["id"])
    pipeline.process_upload(upload_id)
    upload = db.get(Upload, upload_id)
    upload.status = ProcessingStatus.QUEUED  # what the retry endpoint does
    db.add(upload)
    db.commit()
    pipeline.process_upload(upload_id)

    db.expire_all()
    assert db.query(Candidate).count() == 1
    candidate = db.scalar(select(Candidate))
    assert len(candidate.projects) == 2 and len(candidate.certifications) == 2


def test_same_resume_in_two_orgs_makes_two_private_candidates(client, db):
    a = register(client, "alice", org_name="Acme")
    b = register(client, "bob", org_name="Globex")
    pipeline.process_upload(_queue_upload(db, a["org_id"], a["id"]))
    pipeline.process_upload(_queue_upload(db, b["org_id"], b["id"]))

    owners = sorted(c.org_id for c in db.scalars(select(Candidate)))
    assert owners == sorted([a["org_id"], b["org_id"]])
    assert len(client.get("/api/candidates", headers=hdr("alice")).json()) == 1
    assert len(client.get("/api/candidates", headers=hdr("bob")).json()) == 1


def test_batch_rescores_each_job_once_not_once_per_file(client, db, monkeypatch):
    org = register(client, "alice", org_name="Acme")
    create_job(client, "alice")
    create_job(client, "alice", title="Data Engineer")
    ids = [_queue_upload(db, org["org_id"], org["id"], name=f"r{i}.txt") for i in range(3)]
    # Distinct content so none are de-duplicated into one candidate.
    for i, upload_id in enumerate(ids):
        path = Path(db.get(Upload, upload_id).stored_filename)
        path.write_text(PRIYA.read_text() + f"\nUnique line {i}\n", encoding="utf-8")

    calls: list[int] = []
    real = ranking.rescore_job
    monkeypatch.setattr(ranking, "rescore_job", lambda d, job: calls.append(job.id) or real(d, job))

    for upload_id in ids:
        pipeline.process_upload(upload_id, batch=True)
    assert calls == []  # nothing scored per file
    pipeline.flush_pending()

    assert sorted(calls) == [1, 2]  # one pass per job, three files
    db.expire_all()
    assert all(u.status is ProcessingStatus.DONE for u in db.scalars(select(Upload)))
    assert db.query(Match).count() == 6


def test_unfinished_uploads_are_requeued_after_a_restart(client, db, monkeypatch):
    org = register(client, "alice", org_name="Acme")
    queued = _queue_upload(db, org["org_id"], org["id"])
    done = _queue_upload(db, org["org_id"], org["id"], name="done.txt")
    gone = Upload(original_filename="x", stored_filename="/nope/x.pdf", org_id=org["org_id"],
                  status=ProcessingStatus.PARSING)
    db.add(gone)
    d = db.get(Upload, done)
    d.status = ProcessingStatus.DONE
    db.add(d)
    db.commit()

    enqueued: list[int] = []
    monkeypatch.setattr(pipeline, "enqueue", lambda ids: enqueued.extend(ids))
    assert pipeline.requeue_unfinished() == 1
    assert enqueued == [queued]
    db.expire_all()
    assert db.get(Upload, gone.id).status is ProcessingStatus.FAILED


def test_concurrent_match_insert_is_retried_not_fatal(client, db, monkeypatch):
    from app.models import Skill

    org = register(client, "alice", org_name="Acme")
    job = create_job(client, "alice")
    c = Candidate(org_id=org["org_id"], full_name="Q", resume_text="python sql", total_experience=4)
    c.skills = [Skill(name="python")]
    db.add(c)
    db.commit()

    real_commit = Session.commit
    state = {"raced": False}

    def racing_commit(session):
        if not state["raced"] and any(isinstance(o, Match) for o in session.new):
            state["raced"] = True
            # Another worker wins the INSERT first.
            with Session(session.get_bind()) as other:
                other.add(Match(job_id=job["id"], candidate_id=c.id))
                other.commit()
        return real_commit(session)

    monkeypatch.setattr(Session, "commit", racing_commit)
    ranking.rescore_job(db, db.get(Job, job["id"]))
    monkeypatch.undo()

    assert state["raced"]
    matches = db.scalars(select(Match).where(Match.job_id == job["id"])).all()
    assert len(matches) == 1 and matches[0].overall_score > 0


def test_scanned_pdf_is_rejected_with_a_needs_ocr_message(tmp_path):
    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    scan = tmp_path / "scan.pdf"
    with scan.open("wb") as handle:
        writer.write(handle)
    with pytest.raises(extraction.ExtractionError, match="OCR"):
        extraction.extract_text(scan)


def test_oversized_upload_is_rejected_after_a_bounded_read(client, monkeypatch):
    from app.api.routes import uploads

    register(client, "alice", org_name="Acme")
    monkeypatch.setattr(uploads, "MAX_FILE_BYTES", 1024)
    response = client.post(
        "/api/uploads",
        files=[("files", ("big.txt", b"x" * 5000, "text/plain"))],
        headers=hdr("alice"),
    )
    assert response.status_code == 202
    assert response.json()[0]["status"] == "failed"
    assert "limit" in response.json()[0]["error_message"]


# --------------------------------------------------------------------------- #
# Migration of pre-tenancy databases
# --------------------------------------------------------------------------- #
def test_legacy_database_is_migrated_into_personal_orgs(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    # A pre-tenancy `users` table: no org_id column.
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, firebase_uid VARCHAR(128), email VARCHAR(255), "
            "full_name VARCHAR(255), role VARCHAR(9), is_active BOOLEAN, created_at DATETIME)"
        ))
        conn.execute(text(
            "INSERT INTO users VALUES (1,'u1','r1@x.com','Rita','RECRUITER',1,'2024-01-01'),"
            "(2,'u2','r2@x.com','Ravi','RECRUITER',1,'2024-01-02'),"
            "(3,'u3','c@x.com','Cara','CANDIDATE',1,'2024-01-03')"
        ))
    sync_schema(engine)

    with Session(engine) as db:
        db.add_all([
            Job(title="Old job", created_by_id=1),
            Job(title="Orphan job", created_by_id=None),
            Candidate(full_name="Uploaded", resume_text="x"),
            Candidate(full_name="Self", resume_text="x", user_id=3),
        ])
        db.commit()
        db.add(Upload(original_filename="a", stored_filename="a", uploaded_by_id=2, candidate_id=1,
                      status=ProcessingStatus.DONE))
        db.commit()
    backfill_organizations(engine)
    backfill_organizations(engine)  # idempotent

    with Session(engine) as db:
        users = {u.id: u for u in db.scalars(select(User))}
        assert users[1].org_id and users[2].org_id and users[1].org_id != users[2].org_id
        assert users[3].org_id is None  # candidates never get one
        assert db.query(Organization).count() == 2
        jobs = {j.title: j for j in db.scalars(select(Job))}
        assert jobs["Old job"].org_id == users[1].org_id
        assert jobs["Orphan job"].org_id is not None  # falls back to the oldest org, not the open pool
        uploaded, self_registered = db.scalars(select(Candidate).order_by(Candidate.id)).all()
        assert uploaded.org_id == users[2].org_id  # followed the upload that produced it
        assert self_registered.org_id is None  # talent pool
        assert uploaded.latest_upload_id is not None
        assert all(u.role in (UserRole.RECRUITER, UserRole.CANDIDATE) for u in users.values())
    Base.metadata.drop_all(engine)
