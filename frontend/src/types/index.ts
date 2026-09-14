export type UserRole = 'admin' | 'recruiter' | 'candidate'
export type JobStatus = 'draft' | 'active' | 'closed'
export type PipelineStage =
  | 'new'
  | 'shortlisted'
  | 'interviewing'
  | 'offer'
  | 'hired'
  | 'rejected'
export type ProcessingStatus =
  | 'queued'
  | 'extracting'
  | 'parsing'
  | 'embedding'
  | 'done'
  | 'failed'

export type DimensionKey =
  | 'skills'
  | 'experience'
  | 'education'
  | 'semantic'
  | 'location'

export interface User {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export interface JobWeights {
  skills: number
  experience: number
  education: number
  semantic: number
  location: number
}

export interface Job {
  id: number
  title: string
  department: string | null
  description: string
  required_skills: string[]
  nice_to_have_skills: string[]
  required_experience: number
  required_education: string | null
  location: string | null
  remote_ok: boolean
  salary_min: number | null
  salary_max: number | null
  status: JobStatus
  created_at: string
  updated_at: string
  weights: JobWeights
  candidate_count: number
  shortlisted_count: number
  average_score: number
}

export interface Skill {
  id: number
  name: string
  category: string | null
  proficiency: string | null
  confidence: number
  evidence: string | null
}

export interface WorkExperienceItem {
  id: number
  company: string | null
  title: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
}

export interface EducationItem {
  id: number
  degree: string | null
  field_of_study: string | null
  institution: string | null
  graduation_year: string | null
}

export interface Candidate {
  id: number
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  headline: string | null
  total_experience: number
  highest_qualification: string | null
  university: string | null
  source_filename: string | null
  health_score: number
  verified_by_candidate: boolean
  created_at: string
  skills: Skill[]
  experiences: WorkExperienceItem[]
  educations: EducationItem[]
  is_anonymized: boolean
}

export interface HealthCheckItem {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fix: string | null
}

export interface HealthReport {
  score: number
  grade: string
  checks: HealthCheckItem[]
  warnings: string[]
}

export interface CandidateDetail extends Candidate {
  resume_text: string
  health_report: HealthReport | null
}

export interface DimensionScore {
  key: DimensionKey
  label: string
  score: number
  weight: number
  contribution: number
  detail: string
}

export interface MatchedSkill {
  required: string
  matched_with: string | null
  kind: 'exact' | 'alias' | 'semantic' | 'missing'
  similarity: number
  evidence: string | null
}

export interface Explanation {
  dimensions: Record<DimensionKey, DimensionScore>
  matched_skills: MatchedSkill[]
  missing_skills: string[]
  evidence: { skill: string; snippet: string }[]
  summary: string
}

export interface Match {
  id: number
  job_id: number
  candidate_id: number
  overall_score: number
  skills_score: number
  experience_score: number
  education_score: number
  semantic_score: number
  location_score: number
  stage: PipelineStage
  scored_at: string
  candidate: Candidate
  rank: number
  note_count: number
  average_rating: number | null
}

export interface Note {
  id: number
  author_name: string
  body: string
  rating: number | null
  created_at: string
}

export interface MatchDetail extends Match {
  explanation: Explanation | null
  notes: Note[]
}

export interface Upload {
  id: number
  original_filename: string
  size_bytes: number
  status: ProcessingStatus
  progress: number
  error_message: string | null
  is_duplicate: boolean
  candidate_id: number | null
  created_at: string
  completed_at: string | null
}

export interface UploadEvent {
  type: 'upload.progress' | 'upload.completed'
  upload_id: number
  filename: string
  status: ProcessingStatus
  progress: number
  candidate_id: number | null
  candidate_name?: string | null
  is_duplicate: boolean
  health_score?: number
  error: string | null
  message?: string | null
}

export interface Analytics {
  total_candidates: number
  total_jobs: number
  total_matches: number
  processed_today: number
  average_score: number
  score_distribution: { band: string; count: number }[]
  pipeline_funnel: { stage: string; label: string; count: number }[]
  skill_gaps: { skill: string; required: boolean; supply: number; supply_pct: number }[]
  top_skills: { skill: string; count: number }[]
  experience_distribution: { band: string; count: number }[]
  upload_success_rate: number
}

export interface AuditEvent {
  id: number
  actor_name: string
  action: string
  entity_type: string
  entity_id: number | null
  summary: string
  created_at: string
}

export interface WeightPreviewRow {
  match_id: number
  candidate_id: number
  overall_score: number
  rank: number
  dimensions: Record<DimensionKey, number>
}

export interface FilterOptions {
  skills: { name: string; count: number }[]
  educations: string[]
  locations: string[]
}

export interface HealthStatus {
  status: string
  version: string
  database: string
  matching: {
    backend: string
    state: 'ready' | 'loading' | 'disabled' | 'unavailable'
    model: string
    enabled: boolean
    loaded: boolean
    error: string | null
  }
}
