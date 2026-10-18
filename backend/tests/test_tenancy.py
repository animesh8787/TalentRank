"""Organisation scoping: one team must never see or touch another team's data."""
from __future__ import annotations

from sqlalchemy import select

from app.models import AuditEvent, Candidate, Job, Match, ProcessingStatus, Upload
from app.services import ranking

from .conftest import create_job, hdr, make_candidate, register


def _rescore_all(db):
    for job in db.scalars(select(Job)):
        ranking.rescore_job(db, job)


def test_recruiter_signup_creates_org_and_invite_joins_it(client):
    a = register(client, "alice", org_name="Acme")
    assert a["org_name"] == "Acme"
    code = client.get("/api/orgs/me", headers=hdr("alice")).json()["invite_code"]

    assert client.get(f"/api/orgs/invite/{code}").json() == {"valid": True, "org_name": "Acme"}
    assert client.get("/api/orgs/invite/NOPE").json()["valid"] is False

    b = register(client, "bob", invite_code=code)
    assert b["org_id"] == a["org_id"]
    # A bad code is rejected rather than silently creating a new org.
    bad = client.post(
        "/api/auth/register", json={"full_name": "Eve", "role": "recruiter", "invite_code": "XXXX"},
        headers=hdr("eve"),
    )
    assert bad.status_code == 400


def test_register_is_idempotent_and_unregistered_is_403(client):
    first = register(client, "dana", "candidate")
    again = register(client, "dana", "candidate")
    assert first["id"] == again["id"]
    # Valid token, no profile: 403 (not 401, which would sign the client out).
    response = client.get("/api/auth/me", headers=hdr("ghost"))
    assert response.status_code == 403
    assert response.json()["detail"] == "not registered"


def test_jobs_are_scoped_to_the_organisation(client):
    register(client, "alice", org_name="Acme")
    register(client, "bob", org_name="Globex")
    job = create_job(client, "alice")

    assert [j["id"] for j in client.get("/api/jobs", headers=hdr("alice")).json()] == [job["id"]]
    assert client.get("/api/jobs", headers=hdr("bob")).json() == []
    assert client.get(f"/api/jobs/{job['id']}", headers=hdr("bob")).status_code == 404
    assert client.delete(f"/api/jobs/{job['id']}", headers=hdr("bob")).status_code == 404
    assert client.patch(f"/api/jobs/{job['id']}", json={"title": "x"}, headers=hdr("bob")).status_code == 404
    assert client.get(f"/api/jobs/{job['id']}/matches", headers=hdr("bob")).status_code == 404
    assert client.get(f"/api/jobs/{job['id']}/export.csv", headers=hdr("bob")).status_code == 404
    assert client.get(f"/api/jobs/{job['id']}", headers=hdr("alice")).status_code == 200


def test_candidates_uploaded_by_one_team_are_invisible_to_another(client, db):
    a = register(client, "alice", org_name="Acme")
    b = register(client, "bob", org_name="Globex")
    create_job(client, "alice")
    create_job(client, "bob")
    cid = make_candidate(db, org_id=a["org_id"], name="Alice Candidate")
    _rescore_all(db)

    assert [c["id"] for c in client.get("/api/candidates", headers=hdr("alice")).json()] == [cid]
    assert client.get("/api/candidates", headers=hdr("bob")).json() == []
    assert client.get(f"/api/candidates/{cid}", headers=hdr("bob")).status_code == 404
    assert client.delete(f"/api/candidates/{cid}", headers=hdr("bob")).status_code == 404
    assert client.patch(f"/api/candidates/{cid}", json={"full_name": "x"}, headers=hdr("bob")).status_code == 404
    assert client.get(f"/api/candidates/{cid}/duplicates", headers=hdr("bob")).status_code == 404
    # Bob's job was never scored against Alice's candidate.
    assert db.scalar(select(Match).where(Match.candidate_id == cid, Match.job.has(org_id=b["org_id"]))) is None
    skills = client.get("/api/candidates/filters", headers=hdr("bob")).json()
    assert skills["skills"] == [] and skills["locations"] == []


def test_matches_notes_and_analytics_are_scoped(client, db):
    a = register(client, "alice", org_name="Acme")
    register(client, "bob", org_name="Globex")
    job = create_job(client, "alice")
    make_candidate(db, org_id=a["org_id"])
    _rescore_all(db)
    match_id = client.get(f"/api/jobs/{job['id']}/matches", headers=hdr("alice")).json()[0]["id"]

    assert client.get(f"/api/matches/{match_id}", headers=hdr("bob")).status_code == 404
    assert client.patch(f"/api/matches/{match_id}/stage", json={"stage": "hired"}, headers=hdr("bob")).status_code == 404
    assert client.post(f"/api/matches/{match_id}/notes", json={"body": "hi"}, headers=hdr("bob")).status_code == 404

    note = client.post(f"/api/matches/{match_id}/notes", json={"body": "good"}, headers=hdr("alice")).json()
    assert client.delete(f"/api/notes/{note['id']}", headers=hdr("bob")).status_code == 404

    mine = client.get("/api/analytics", headers=hdr("alice")).json()
    theirs = client.get("/api/analytics", headers=hdr("bob")).json()
    assert (mine["total_candidates"], mine["total_jobs"], mine["total_matches"]) == (1, 1, 1)
    assert (theirs["total_candidates"], theirs["total_jobs"], theirs["total_matches"]) == (0, 0, 0)
    assert client.get(f"/api/analytics?job_id={job['id']}", headers=hdr("bob")).status_code == 404

    actions = {e["action"] for e in client.get("/api/audit", headers=hdr("alice")).json()}
    assert "note.add" in actions
    assert {e["actor_name"] for e in client.get("/api/audit", headers=hdr("bob")).json()} <= {"Bob"}


def test_talent_pool_candidate_visible_only_through_an_active_job(client, db):
    register(client, "alice", org_name="Acme")
    register(client, "bob", org_name="Globex")
    user = register(client, "pat", "candidate")
    pool_id = db.scalar(select(Candidate.id).where(Candidate.user_id == user["id"]))
    pool = db.get(Candidate, pool_id)
    pool.resume_text = "Pat\nPython SQL developer"
    pool.total_experience = 4
    db.add(pool)
    db.add_all([])
    db.commit()

    job = create_job(client, "alice")  # rescoring on create picks up the pool candidate
    assert [c["id"] for c in client.get("/api/candidates", headers=hdr("alice")).json()] == [pool_id]
    assert client.get("/api/candidates", headers=hdr("bob")).json() == []  # Bob has no open job
    # Pool candidates are read-only and undeletable for recruiters.
    assert client.delete(f"/api/candidates/{pool_id}", headers=hdr("alice")).status_code == 403
    assert client.patch(f"/api/candidates/{pool_id}", json={"headline": "x"}, headers=hdr("alice")).status_code == 403

    client.patch(f"/api/jobs/{job['id']}", json={"status": "closed"}, headers=hdr("alice"))
    assert client.get("/api/candidates", headers=hdr("alice")).json() == []


def test_upload_retry_download_and_stream_owner_checks(client, db):
    a = register(client, "alice", org_name="Acme")
    register(client, "bob", org_name="Globex")
    stored = ranking.__file__  # any real file inside the app; download checks the storage dir separately
    upload = Upload(
        original_filename="r.pdf", stored_filename=stored, org_id=a["org_id"],
        status=ProcessingStatus.FAILED, uploaded_by_id=1,
    )
    db.add(upload)
    db.commit()

    assert client.post(f"/api/uploads/{upload.id}/retry", headers=hdr("bob")).status_code == 404
    assert client.get(f"/api/uploads/{upload.id}/file", headers=hdr("bob")).status_code == 404
    assert client.get("/api/uploads", headers=hdr("bob")).json() == []
    assert len(client.get("/api/uploads", headers=hdr("alice")).json()) == 1
    assert client.post(f"/api/uploads/{upload.id}/retry", headers=hdr("alice")).status_code == 200
    audited = db.scalar(select(AuditEvent).where(AuditEvent.action == "upload.retry"))
    assert audited is not None and audited.org_id == a["org_id"]


def test_candidate_cannot_use_staff_endpoints_or_see_pipeline_stats(client):
    register(client, "alice", org_name="Acme")
    job = create_job(client, "alice")
    register(client, "pat", "candidate")
    assert client.get("/api/candidates", headers=hdr("pat")).status_code == 403
    assert client.get("/api/analytics", headers=hdr("pat")).status_code == 403
    listed = client.get("/api/jobs", headers=hdr("pat")).json()
    assert [j["id"] for j in listed] == [job["id"]]
    assert listed[0]["candidate_count"] == 0 and listed[0]["average_score"] == 0.0
