"""Pydantic request/response models."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import JobStatus, PipelineStage, ProcessingStatus, UserRole
from app.services.taxonomy import EMAIL_RE


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.CANDIDATE

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        # Uses the same pattern as resume parsing rather than pulling in the
        # optional email-validator dependency for one field.
        value = value.strip().lower()
        if not EMAIL_RE.fullmatch(value):
            raise ValueError("Enter a valid email address.")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------------------------- #
# Jobs
# --------------------------------------------------------------------------- #
class JobWeights(BaseModel):
    skills: float = Field(0.35, ge=0, le=1)
    experience: float = Field(0.25, ge=0, le=1)
    education: float = Field(0.15, ge=0, le=1)
    semantic: float = Field(0.15, ge=0, le=1)
    location: float = Field(0.10, ge=0, le=1)


class JobBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    department: str | None = None
    description: str = ""
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    required_experience: float = Field(0.0, ge=0, le=50)
    required_education: str | None = None
    location: str | None = None
    remote_ok: bool = False
    salary_min: int | None = None
    salary_max: int | None = None
    status: JobStatus = JobStatus.ACTIVE


class JobCreate(JobBase):
    weights: JobWeights = Field(default_factory=JobWeights)


class JobUpdate(BaseModel):
    title: str | None = None
    department: str | None = None
    description: str | None = None
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None
    required_experience: float | None = None
    required_education: str | None = None
    location: str | None = None
    remote_ok: bool | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    status: JobStatus | None = None
    weights: JobWeights | None = None


class JobOut(ORMModel):
    id: int
    title: str
    department: str | None
    description: str
    required_skills: list[str]
    nice_to_have_skills: list[str]
    required_experience: float
    required_education: str | None
    location: str | None
    remote_ok: bool
    salary_min: int | None
    salary_max: int | None
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    weights: JobWeights
    candidate_count: int = 0
    shortlisted_count: int = 0
    average_score: float = 0.0


# --------------------------------------------------------------------------- #
# Candidates
# --------------------------------------------------------------------------- #
class SkillOut(ORMModel):
    id: int
    name: str
    category: str | None
    proficiency: str | None
    confidence: float
    evidence: str | None


class WorkExperienceOut(ORMModel):
    id: int
    company: str | None
    title: str | None
    start_date: str | None
    end_date: str | None
    description: str | None


class EducationOut(ORMModel):
    id: int
    degree: str | None
    field_of_study: str | None
    institution: str | None
    graduation_year: str | None


class CandidateOut(ORMModel):
    id: int
    full_name: str | None
    email: str | None
    phone: str | None
    location: str | None
    linkedin_url: str | None
    github_url: str | None
    portfolio_url: str | None
    headline: str | None
    total_experience: float
    highest_qualification: str | None
    university: str | None
    source_filename: str | None
    health_score: float
    verified_by_candidate: bool
    created_at: datetime
    skills: list[SkillOut] = Field(default_factory=list)
    experiences: list[WorkExperienceOut] = Field(default_factory=list)
    educations: list[EducationOut] = Field(default_factory=list)
    is_anonymized: bool = False


class CandidateDetail(CandidateOut):
    resume_text: str = ""
    health_report: dict | None = None


class CandidateUpdate(BaseModel):
    """Used by the candidate self-service correction form."""
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    headline: str | None = None
    total_experience: float | None = Field(None, ge=0, le=50)
    highest_qualification: str | None = None
    university: str | None = None
    skills: list[str] | None = None


# --------------------------------------------------------------------------- #
# Uploads
# --------------------------------------------------------------------------- #
class UploadOut(ORMModel):
    id: int
    original_filename: str
    size_bytes: int
    status: ProcessingStatus
    progress: int
    error_message: str | None
    is_duplicate: bool
    candidate_id: int | None
    created_at: datetime
    completed_at: datetime | None


# --------------------------------------------------------------------------- #
# Matches / ranking
# --------------------------------------------------------------------------- #
class NoteOut(ORMModel):
    id: int
    author_name: str
    body: str
    rating: int | None
    created_at: datetime


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    rating: int | None = Field(None, ge=1, le=5)


class MatchOut(ORMModel):
    id: int
    job_id: int
    candidate_id: int
    overall_score: float
    skills_score: float
    experience_score: float
    education_score: float
    semantic_score: float
    location_score: float
    stage: PipelineStage
    scored_at: datetime
    candidate: CandidateOut
    rank: int = 0
    note_count: int = 0
    average_rating: float | None = None


class MatchDetail(MatchOut):
    explanation: dict | None = None
    notes: list[NoteOut] = Field(default_factory=list)


class StageUpdate(BaseModel):
    stage: PipelineStage


class WeightPreviewRequest(BaseModel):
    weights: JobWeights


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #
class SkillGap(BaseModel):
    skill: str
    required: bool
    supply: int
    supply_pct: float


class AnalyticsOut(BaseModel):
    total_candidates: int
    total_jobs: int
    total_matches: int
    processed_today: int
    average_score: float
    score_distribution: list[dict]
    pipeline_funnel: list[dict]
    skill_gaps: list[SkillGap]
    top_skills: list[dict]
    experience_distribution: list[dict]
    upload_success_rate: float


class AuditEventOut(ORMModel):
    id: int
    actor_name: str
    action: str
    entity_type: str
    entity_id: int | None
    summary: str
    created_at: datetime
