"""Pydantic request/response models."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    EmploymentType,
    JobStatus,
    PipelineStage,
    ProcessingStatus,
    Seniority,
    UserRole,
    WorkMode,
)


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


class RegisterRequest(BaseModel):
    """Provisions a TalentRank profile for an already-created Firebase account.

    No email or password here — Firebase already verified those client-side;
    the caller is identified by their bearer token, not this body.
    """
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.CANDIDATE


# --------------------------------------------------------------------------- #
# Jobs
# --------------------------------------------------------------------------- #
class JobWeights(BaseModel):
    """Lenient shape — used for API output and the live weight-preview
    endpoint, which is expected to be called with in-progress values while a
    recruiter is still dragging sliders. See JobWeightsInput for the strict
    variant that create/update actually persist."""
    skills: float = Field(0.30, ge=0, le=1)
    experience: float = Field(0.20, ge=0, le=1)
    education: float = Field(0.10, ge=0, le=1)
    semantic: float = Field(0.15, ge=0, le=1)
    location: float = Field(0.10, ge=0, le=1)
    projects: float = Field(0.10, ge=0, le=1)
    certifications: float = Field(0.05, ge=0, le=1)


class JobWeightsInput(JobWeights):
    """Weights supplied when creating or updating a role. Must total exactly
    100% (within floating-point tolerance) — every dimension is visible to
    the recruiter, so there is no ambiguous remainder to distribute."""

    @model_validator(mode="after")
    def _must_total_100_percent(self) -> "JobWeightsInput":
        total = (
            self.skills + self.experience + self.education + self.semantic
            + self.location + self.projects + self.certifications
        )
        if abs(total - 1.0) > 0.005:
            raise ValueError(
                f"Scoring weights must total exactly 100% (currently {total * 100:.1f}%)."
            )
        return self


class JobBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    department: str | None = None
    industry: str | None = None
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    seniority: Seniority | None = None
    description: str = ""
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    required_experience: float = Field(0.0, ge=0, le=50)
    required_experience_max: float | None = Field(None, ge=0, le=50)
    required_education: str | None = None
    location: str | None = None
    remote_ok: bool = False
    salary_min: int | None = None
    salary_max: int | None = None
    status: JobStatus = JobStatus.ACTIVE


class JobCreate(JobBase):
    weights: JobWeightsInput = Field(default_factory=JobWeightsInput)


class JobUpdate(BaseModel):
    title: str | None = None
    department: str | None = None
    industry: str | None = None
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    seniority: Seniority | None = None
    description: str | None = None
    required_skills: list[str] | None = None
    nice_to_have_skills: list[str] | None = None
    required_experience: float | None = None
    required_experience_max: float | None = None
    required_education: str | None = None
    location: str | None = None
    remote_ok: bool | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    status: JobStatus | None = None
    weights: JobWeightsInput | None = None


class JobOut(ORMModel):
    id: int
    title: str
    department: str | None
    industry: str | None = None
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    seniority: Seniority | None = None
    description: str
    required_skills: list[str]
    nice_to_have_skills: list[str]
    required_experience: float
    required_experience_max: float | None = None
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


class ProjectOut(ORMModel):
    id: int
    name: str
    description: str | None
    technologies: list[str]
    url: str | None
    start_date: str | None
    end_date: str | None


class CertificationOut(ORMModel):
    id: int
    name: str
    issuer: str | None
    issue_date: str | None
    credential_url: str | None


# --------------------------------------------------------------------------- #
# Candidate self-service editing — one "In" shape per editable list, each
# missing only the id the database assigns. CandidateUpdate replaces a whole
# list at once (same pattern the existing `skills` field already uses).
# --------------------------------------------------------------------------- #
class WorkExperienceIn(BaseModel):
    company: str | None = None
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None


class EducationIn(BaseModel):
    degree: str | None = None
    field_of_study: str | None = None
    institution: str | None = None
    graduation_year: str | None = None


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    technologies: list[str] = Field(default_factory=list)
    url: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class CertificationIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    issuer: str | None = None
    issue_date: str | None = None
    credential_url: str | None = None


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
    projects: list[ProjectOut] = Field(default_factory=list)
    certifications: list[CertificationOut] = Field(default_factory=list)
    is_anonymized: bool = False


class CandidateDetail(CandidateOut):
    resume_text: str = ""
    health_report: dict | None = None


class CandidateUpdate(BaseModel):
    """Used by the candidate self-service correction form.

    Each list field (skills/experiences/educations/projects/certifications)
    replaces that whole list when provided at all — the same "send the full
    corrected list" pattern the original `skills` field already used.
    """
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
    experiences: list[WorkExperienceIn] | None = None
    educations: list[EducationIn] | None = None
    projects: list[ProjectIn] | None = None
    certifications: list[CertificationIn] | None = None


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
    projects_score: float = 0.0
    certifications_score: float = 0.0
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
# Candidate-facing role matching — "Roles you match", skill gap, and
# recommendations. Built entirely from the same Match rows and scorer output
# staff already see; see app.api.routes.candidates.my_matches.
# --------------------------------------------------------------------------- #
class SkillGapItem(BaseModel):
    skill: str
    required: bool  # True = required skill, False = nice-to-have
    status: str  # strong | developing | missing
    similarity: float
    evidence: str | None = None


class RecommendationOut(BaseModel):
    category: str
    priority: str  # high | medium | low
    title: str
    message: str


class RoleMatchJobOut(ORMModel):
    id: int
    title: str
    department: str | None
    location: str | None
    remote_ok: bool
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    seniority: Seniority | None = None
    required_skills: list[str]
    nice_to_have_skills: list[str]
    required_experience: float


class RoleMatchOut(BaseModel):
    """One role from the candidate's own point of view: score, why, the
    skill gap for that role, and what to do about it."""
    job: RoleMatchJobOut
    overall_score: float
    dimensions: dict
    summary: str
    matched_skills: list[dict] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    preferred_matched: list[dict] = Field(default_factory=list)
    preferred_missing: list[str] = Field(default_factory=list)
    skill_gap: list[SkillGapItem] = Field(default_factory=list)
    recommendations: list[RecommendationOut] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Recruiter-side JD intelligence and skill suggestions
# --------------------------------------------------------------------------- #
class JDParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class JDParseResult(BaseModel):
    """A draft only — never saved until the recruiter reviews and submits it
    as an ordinary JobCreate."""
    title: str | None = None
    seniority: Seniority | None = None
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    location: str | None = None
    required_experience: float = 0.0
    required_experience_max: float | None = None
    required_education: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    description: str = ""
    notes: list[str] = Field(default_factory=list)


class SkillSuggestionRequest(BaseModel):
    title: str = Field("", max_length=255)
    description: str = Field("", max_length=5_000)


class SkillSuggestionsOut(BaseModel):
    skills: list[str]


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
