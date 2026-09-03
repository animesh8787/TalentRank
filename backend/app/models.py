"""Single source of truth for the schema.

Replaces the three conflicting definitions that used to live in
preprocessing/Database_setup/db_design.py, preprocessing/database/schema.py and
preprocessing/dataextraction.py. Primary keys are uniformly `id`.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class UserRole(str, enum.Enum):
    ADMIN = "admin"
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"


class ProcessingStatus(str, enum.Enum):
    QUEUED = "queued"
    EXTRACTING = "extracting"
    PARSING = "parsing"
    EMBEDDING = "embedding"
    DONE = "done"
    FAILED = "failed"


class PipelineStage(str, enum.Enum):
    """Recruiter-facing kanban columns."""

    NEW = "new"
    SHORTLISTED = "shortlisted"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"


class JobStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Firebase owns identity and password verification; this is the only link
    # between "who Firebase says this is" and our own role/profile data.
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.RECRUITER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    candidate_profile: Mapped["Candidate | None"] = relationship(back_populates="user")


# --------------------------------------------------------------------------- #
# Jobs
# --------------------------------------------------------------------------- #
class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    department: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    required_skills: Mapped[list] = mapped_column(JSON, default=list)
    nice_to_have_skills: Mapped[list] = mapped_column(JSON, default=list)
    required_experience: Mapped[float] = mapped_column(Float, default=0.0)
    required_education: Mapped[str | None] = mapped_column(String(120))
    location: Mapped[str | None] = mapped_column(String(255))
    remote_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.ACTIVE)

    # Per-job scoring weights. Recruiters tune these live; they are normalised
    # to sum to 1.0 at scoring time so partial edits can never skew a ranking.
    weight_skills: Mapped[float] = mapped_column(Float, default=0.35)
    weight_experience: Mapped[float] = mapped_column(Float, default=0.25)
    weight_education: Mapped[float] = mapped_column(Float, default=0.15)
    weight_semantic: Mapped[float] = mapped_column(Float, default=0.15)
    weight_location: Mapped[float] = mapped_column(Float, default=0.10)

    embedding: Mapped[list | None] = mapped_column(JSON)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    matches: Mapped[list["Match"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )

    @property
    def weights(self) -> dict[str, float]:
        return {
            "skills": self.weight_skills,
            "experience": self.weight_experience,
            "education": self.weight_education,
            "semantic": self.weight_semantic,
            "location": self.weight_location,
        }


# --------------------------------------------------------------------------- #
# Candidates
# --------------------------------------------------------------------------- #
class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    full_name: Mapped[str | None] = mapped_column(String(255), index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(64))
    location: Mapped[str | None] = mapped_column(String(255))
    linkedin_url: Mapped[str | None] = mapped_column(String(512))
    github_url: Mapped[str | None] = mapped_column(String(512))
    portfolio_url: Mapped[str | None] = mapped_column(String(512))

    total_experience: Mapped[float] = mapped_column(Float, default=0.0)
    highest_qualification: Mapped[str | None] = mapped_column(String(120))
    university: Mapped[str | None] = mapped_column(String(255))
    headline: Mapped[str | None] = mapped_column(String(512))

    resume_text: Mapped[str] = mapped_column(Text, default="")
    source_filename: Mapped[str | None] = mapped_column(String(512))
    stored_filename: Mapped[str | None] = mapped_column(String(512))
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    embedding: Mapped[list | None] = mapped_column(JSON)

    # Tier-3: resume health report surfaced back to the candidate
    health_score: Mapped[float] = mapped_column(Float, default=0.0)
    health_report: Mapped[dict | None] = mapped_column(JSON)

    # Set once a candidate reviews and corrects their own parsed data
    verified_by_candidate: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    user: Mapped["User | None"] = relationship(back_populates="candidate_profile")
    skills: Mapped[list["Skill"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan", lazy="selectin"
    )
    experiences: Mapped[list["WorkExperience"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan", lazy="selectin"
    )
    educations: Mapped[list["Education"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan", lazy="selectin"
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )
    upload: Mapped["Upload | None"] = relationship(back_populates="candidate")

    @property
    def skill_names(self) -> list[str]:
        return [s.name for s in self.skills]


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("candidate_id", "name", name="uq_candidate_skill"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120), index=True)
    category: Mapped[str | None] = mapped_column(String(64))
    proficiency: Mapped[str | None] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    evidence: Mapped[str | None] = mapped_column(Text)

    candidate: Mapped["Candidate"] = relationship(back_populates="skills")


class WorkExperience(Base):
    __tablename__ = "work_experience"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    company: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[str | None] = mapped_column(String(32))
    end_date: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)

    candidate: Mapped["Candidate"] = relationship(back_populates="experiences")


class Education(Base):
    __tablename__ = "education"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"))
    degree: Mapped[str | None] = mapped_column(String(120))
    field_of_study: Mapped[str | None] = mapped_column(String(255))
    institution: Mapped[str | None] = mapped_column(String(255))
    graduation_year: Mapped[str | None] = mapped_column(String(16))

    candidate: Mapped["Candidate"] = relationship(back_populates="educations")


# --------------------------------------------------------------------------- #
# Uploads (drives the live progress stream)
# --------------------------------------------------------------------------- #
class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    stored_filename: Mapped[str] = mapped_column(String(512))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_type: Mapped[str | None] = mapped_column(String(120))

    status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus), default=ProcessingStatus.QUEUED, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)

    candidate_id: Mapped[int | None] = mapped_column(
        ForeignKey("candidates.id", ondelete="SET NULL")
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    candidate: Mapped["Candidate | None"] = relationship(back_populates="upload")


# --------------------------------------------------------------------------- #
# Matching / pipeline
# --------------------------------------------------------------------------- #
class Match(Base):
    """One candidate scored against one job, with the full explanation kept."""

    __tablename__ = "matches"
    __table_args__ = (UniqueConstraint("job_id", "candidate_id", name="uq_job_candidate"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), index=True
    )

    overall_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    skills_score: Mapped[float] = mapped_column(Float, default=0.0)
    experience_score: Mapped[float] = mapped_column(Float, default=0.0)
    education_score: Mapped[float] = mapped_column(Float, default=0.0)
    semantic_score: Mapped[float] = mapped_column(Float, default=0.0)
    location_score: Mapped[float] = mapped_column(Float, default=0.0)

    # matched / semantic / missing skill lists plus resume evidence snippets
    explanation: Mapped[dict | None] = mapped_column(JSON)

    stage: Mapped[PipelineStage] = mapped_column(
        Enum(PipelineStage), default=PipelineStage.NEW, index=True
    )
    scored_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    job: Mapped["Job"] = relationship(back_populates="matches")
    candidate: Mapped["Candidate"] = relationship(back_populates="matches")
    notes: Mapped[list["Note"]] = relationship(
        back_populates="match", cascade="all, delete-orphan", lazy="selectin"
    )


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_name: Mapped[str] = mapped_column(String(255), default="Unknown")
    body: Mapped[str] = mapped_column(Text)
    rating: Mapped[int | None] = mapped_column(Integer)  # 1-5 stars, optional
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    match: Mapped["Match"] = relationship(back_populates="notes")


class AuditEvent(Base):
    """Tier-3 audit log: who did what, when."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_name: Mapped[str] = mapped_column(String(255), default="system")
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
