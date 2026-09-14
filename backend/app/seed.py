"""Seed the database with demo jobs and the bundled sample resumes.

Auth accounts are no longer created here — Firebase owns sign-up now, so
there's nothing to seed a password into. Register through the app UI instead
(see README), then optionally promote yourself to admin:

    python -m app.seed              # jobs + sample resumes
    python -m app.seed --no-resumes # jobs only
    python -m app.seed --reset      # wipe first
    python -m app.promote_admin you@example.com
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import select

from app.core.config import BACKEND_DIR, settings
from app.core.database import SessionLocal, engine
from app.models import Base, Candidate, Job, JobStatus, ProcessingStatus, Upload
from app.services import pipeline, ranking

SAMPLE_DIR = BACKEND_DIR.parent / "src" / "components" / "datafiles" / "Input_files" / "sample resume"

DEMO_JOBS = [
    {
        "title": "Senior Data Scientist",
        "department": "Data & AI",
        "description": (
            "We are hiring a senior data scientist to build and ship production "
            "machine learning systems. You will own problems end to end: framing "
            "them with stakeholders, building models in Python, and deploying them "
            "with the engineering team. Strong background in NLP or deep learning "
            "expected, along with solid SQL and data pipeline experience."
        ),
        "required_skills": ["python", "machine learning", "deep learning", "nlp", "sql", "pandas"],
        "nice_to_have_skills": ["pytorch", "tensorflow", "aws", "spark"],
        "required_experience": 5.0,
        "required_education": "Masters",
        "location": "Bangalore",
        "remote_ok": False,
        "salary_min": 2_500_000,
        "salary_max": 4_000_000,
    },
    {
        "title": "Full Stack Engineer",
        "department": "Product Engineering",
        "description": (
            "Build customer-facing product features across the stack. You will work "
            "in React and TypeScript on the front end and Python or Node services on "
            "the back end, with Postgres underneath. We care about clean interfaces, "
            "sensible tests and shipping steadily."
        ),
        "required_skills": ["javascript", "react", "node.js", "sql", "git"],
        "nice_to_have_skills": ["typescript", "docker", "aws", "postgresql"],
        "required_experience": 3.0,
        "required_education": "Bachelors",
        "location": "Remote",
        "remote_ok": True,
        "salary_min": 1_600_000,
        "salary_max": 2_800_000,
    },
    {
        "title": "ML Platform Engineer",
        "department": "Data & AI",
        "description": (
            "Own the infrastructure that machine learning runs on: training "
            "pipelines, feature stores, model serving and monitoring. Comfortable "
            "with Kubernetes, Docker and cloud infrastructure as code."
        ),
        "required_skills": ["python", "docker", "kubernetes", "aws", "ci/cd", "linux"],
        "nice_to_have_skills": ["terraform", "airflow", "spark", "machine learning"],
        "required_experience": 4.0,
        "required_education": "Bachelors",
        "location": "Hyderabad",
        "remote_ok": False,
        "salary_min": 2_000_000,
        "salary_max": 3_200_000,
    },
]


def seed_jobs(db) -> list[Job]:
    jobs: list[Job] = []
    for spec in DEMO_JOBS:
        existing = db.scalar(select(Job).where(Job.title == spec["title"]))
        if existing:
            print(f"  job      {spec['title']:<32} already exists")
            jobs.append(existing)
            continue
        job = Job(**spec, status=JobStatus.ACTIVE)  # created_by_id left null: no seeded user to own it
        db.add(job)
        db.commit()
        db.refresh(job)
        print(f"  job      {job.title:<32} created")
        jobs.append(job)
    return jobs


def seed_resumes(db) -> int:
    if not SAMPLE_DIR.is_dir():
        print(f"  ! sample resume directory not found: {SAMPLE_DIR}")
        return 0

    candidates = [
        path for path in sorted(SAMPLE_DIR.iterdir())
        if path.suffix.lower() in {".pdf", ".docx", ".txt"}
    ]
    if not candidates:
        print("  ! no PDF/DOCX samples found")
        return 0

    queued: list[int] = []
    for path in candidates:
        already = db.scalar(select(Upload).where(Upload.original_filename == path.name))
        if already:
            continue

        destination = settings.storage_dir / path.name
        if not destination.exists():
            destination.write_bytes(path.read_bytes())

        record = Upload(
            original_filename=path.name,
            stored_filename=str(destination),
            size_bytes=destination.stat().st_size,
            content_type="application/pdf" if path.suffix.lower() == ".pdf" else None,
            status=ProcessingStatus.QUEUED,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        queued.append(record.id)

    print(f"  resumes  {len(queued)} queued for processing (of {len(candidates)} found)")
    for upload_id in queued:
        pipeline.process_upload(upload_id)  # synchronous so the seed finishes complete
    return len(queued)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the TalentRank database.")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    parser.add_argument("--no-resumes", action="store_true", help="skip sample resumes")
    args = parser.parse_args()

    if args.reset:
        confirm = input("This deletes ALL data. Type 'yes' to continue: ").strip().lower()
        if confirm != "yes":
            print("Aborted.")
            return 1
        Base.metadata.drop_all(engine)
        print("Dropped all tables.")

    Base.metadata.create_all(engine)
    print(f"Seeding {settings.sqlalchemy_url}\n")

    db = SessionLocal()
    try:
        jobs = seed_jobs(db)

        if not args.no_resumes:
            seed_resumes(db)

        print("\n  scoring candidates against every job ...")
        for job in jobs:
            db.refresh(job)
            count = ranking.rescore_job(db, job)
            print(f"    {job.title:<32} {count} candidates scored")

        total = db.scalar(select(Candidate).with_only_columns(Candidate.id)) is not None
        print("\nDone." if total else "\nDone (no candidates ingested).")
        print(
            "\nNo user accounts were created — sign up through the app (Firebase-backed). "
            "To make your account an admin afterwards:\n"
            "    python -m app.promote_admin you@example.com"
        )
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
