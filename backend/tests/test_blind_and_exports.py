"""Blind review is enforced by the server, per job; CSV export is injection-safe."""
from __future__ import annotations

from sqlalchemy import select

from app.api.routes.matches import csv_safe
from app.models import AuditEvent, Job
from app.services import anonymize, ranking

from .conftest import create_job, hdr, make_candidate, register


def _setup(client, db, *, blind: bool, name="Zara Quinn"):
    org = register(client, "alice", org_name="Acme")
    job = create_job(client, "alice", blind_review=blind)
    cid = make_candidate(db, org_id=org["org_id"], name=name)
    ranking.rescore_job(db, db.get(Job, job["id"]))
    return job, cid


def test_blind_job_redacts_without_any_client_header(client, db):
    job, cid = _setup(client, db, blind=True)
    rows = client.get(f"/api/jobs/{job['id']}/matches", headers=hdr("alice")).json()
    candidate = rows[0]["candidate"]
    assert candidate["full_name"] == anonymize.alias_for(cid)
    assert candidate["email"] is None and candidate["phone"] is None
    assert candidate["source_filename"] is None and candidate["is_anonymized"] is True

    resume = client.get(f"/api/candidates/{cid}", headers=hdr("alice")).json()["resume_text"]
    assert "Zara" not in resume and "example.com" not in resume

    # Moving the stage must not drop the redaction (it used to).
    moved = client.patch(
        f"/api/matches/{rows[0]['id']}/stage", json={"stage": "shortlisted"}, headers=hdr("alice")
    ).json()
    assert moved["candidate"]["full_name"] == anonymize.alias_for(cid)

    # The team-wide candidate list and detail are redacted too.
    listed = client.get("/api/candidates", headers=hdr("alice")).json()
    assert listed[0]["full_name"] == anonymize.alias_for(cid)
    assert client.get(f"/api/candidates/{cid}", headers=hdr("alice")).json()["email"] is None
    # ...and name search cannot be used as an identity oracle.
    assert client.get("/api/candidates?search=Zara", headers=hdr("alice")).json() == []
    assert client.get(f"/api/jobs/{job['id']}/matches?search=zara", headers=hdr("alice")).json() == []

    csv_text = client.get(f"/api/jobs/{job['id']}/export.csv", headers=hdr("alice")).text
    assert "Zara" not in csv_text and "example.com" not in csv_text


def test_audit_trail_never_contains_candidate_names(client, db):
    job, _ = _setup(client, db, blind=True)
    match_id = client.get(f"/api/jobs/{job['id']}/matches", headers=hdr("alice")).json()[0]["id"]
    client.patch(f"/api/matches/{match_id}/stage", json={"stage": "interviewing"}, headers=hdr("alice"))
    summaries = [e.summary for e in db.scalars(select(AuditEvent))]
    assert not any("Zara" in text for text in summaries)
    assert any("Moved candidate" in text for text in summaries)


def test_non_blind_job_shows_real_identity(client, db):
    job, _ = _setup(client, db, blind=False)
    candidate = client.get(f"/api/jobs/{job['id']}/matches", headers=hdr("alice")).json()[0]["candidate"]
    assert candidate["full_name"] == "Zara Quinn"
    # The client can still opt in to extra redaction for itself.
    redacted = client.get(
        f"/api/jobs/{job['id']}/matches", headers={**hdr("alice"), "X-Anonymized-Review": "1"}
    ).json()[0]["candidate"]
    assert redacted["full_name"] != "Zara Quinn"


def test_resume_file_is_withheld_for_blind_candidates(client, db):
    from app.models import ProcessingStatus, Upload

    job, cid = _setup(client, db, blind=True)
    org_id = db.scalar(select(Job.org_id).where(Job.id == job["id"]))
    upload = Upload(
        original_filename="Zara_Quinn.pdf", stored_filename=__file__, org_id=org_id,
        candidate_id=cid, status=ProcessingStatus.DONE,
    )
    db.add(upload)
    db.commit()
    assert client.get(f"/api/uploads/{upload.id}/file", headers=hdr("alice")).status_code == 403


def test_csv_cells_that_look_like_formulas_are_neutralised(client, db):
    for risky in ("=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"):
        assert csv_safe(risky).startswith("'")
    assert csv_safe("Plain Name") == "Plain Name"
    assert csv_safe(12) == 12

    org = register(client, "alice", org_name="Acme")
    job = create_job(client, "alice")
    make_candidate(db, org_id=org["org_id"], name="=cmd|' /C calc'!A0")
    ranking.rescore_job(db, db.get(Job, job["id"]))
    body = client.get(f"/api/jobs/{job['id']}/export.csv", headers=hdr("alice")).text
    assert "'=cmd" in body
    assert ",=cmd" not in body
