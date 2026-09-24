import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Lightbulb, Plus, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { cn, weightsTotalPercent } from '@/lib/utils'
import {
  Badge,
  Button,
  DialogBody,
  DialogFooter,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Tooltip,
} from '@/components/ui/primitives'
import { DEFAULT_WEIGHTS, WeightSliders } from '@/components/app/WeightSliders'
import type { EmploymentType, Job, JobWeights, Seniority, WorkMode } from '@/types'

const EDUCATION_OPTIONS = [
  'Any',
  'High School',
  'Diploma / Associate',
  'Bachelors',
  'Masters',
  'PhD',
]

const SENIORITY_OPTIONS: { value: Seniority; label: string }[] = [
  { value: 'internship', label: 'Internship' },
  { value: 'entry', label: 'Entry Level' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid Level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'freelance', label: 'Freelance' },
]

const WORK_MODE_OPTIONS: { value: WorkMode; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

const NONE = '__none__'

export function JobForm({ job, onDone }: { job: Job | null; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const errorSummaryRef = React.useRef<HTMLDivElement>(null)

  // "Paste JD" is only offered when creating a new role from scratch — an
  // existing role's fields are already the source of truth.
  const [mode, setMode] = React.useState<'manual' | 'paste'>(job ? 'manual' : 'manual')
  const [jdText, setJdText] = React.useState('')
  const [jdNotes, setJdNotes] = React.useState<string[]>([])
  const [reviewing, setReviewing] = React.useState(false)

  const [title, setTitle] = React.useState(job?.title ?? '')
  const [department, setDepartment] = React.useState(job?.department ?? '')
  const [industry, setIndustry] = React.useState(job?.industry ?? '')
  const [employmentType, setEmploymentType] = React.useState<EmploymentType | typeof NONE>(job?.employment_type ?? NONE)
  const [workMode, setWorkMode] = React.useState<WorkMode | typeof NONE>(job?.work_mode ?? NONE)
  const [seniority, setSeniority] = React.useState<Seniority | typeof NONE>(job?.seniority ?? NONE)
  const [description, setDescription] = React.useState(job?.description ?? '')
  const [requiredSkills, setRequiredSkills] = React.useState<string[]>(job?.required_skills ?? [])
  const [niceSkills, setNiceSkills] = React.useState<string[]>(job?.nice_to_have_skills ?? [])
  const [experience, setExperience] = React.useState(String(job?.required_experience ?? 0))
  const [experienceMax, setExperienceMax] = React.useState(
    job?.required_experience_max != null ? String(job.required_experience_max) : '',
  )
  const [education, setEducation] = React.useState(job?.required_education ?? 'Any')
  const [location, setLocation] = React.useState(job?.location ?? '')
  const [remoteOk, setRemoteOk] = React.useState(job?.remote_ok ?? false)
  const [salaryMin, setSalaryMin] = React.useState(job?.salary_min ? String(job.salary_min) : '')
  const [salaryMax, setSalaryMax] = React.useState(job?.salary_max ? String(job.salary_max) : '')
  const [status, setStatus] = React.useState(job?.status ?? 'active')
  const [weights, setWeights] = React.useState<JobWeights>(job?.weights ?? DEFAULT_WEIGHTS)

  const parseJD = useMutation({
    mutationFn: () => api.jobs.parseJD(jdText),
    onSuccess: (draft) => {
      if (draft.title) setTitle(draft.title)
      if (draft.seniority) setSeniority(draft.seniority)
      if (draft.employment_type) setEmploymentType(draft.employment_type)
      if (draft.work_mode) {
        setWorkMode(draft.work_mode)
        if (draft.work_mode === 'remote') setRemoteOk(true)
      }
      if (draft.location) setLocation(draft.location)
      if (draft.required_experience) setExperience(String(draft.required_experience))
      if (draft.required_experience_max != null) setExperienceMax(String(draft.required_experience_max))
      if (draft.required_education) setEducation(draft.required_education)
      if (draft.required_skills.length) setRequiredSkills(draft.required_skills)
      if (draft.nice_to_have_skills.length) setNiceSkills(draft.nice_to_have_skills)
      setDescription(jdText)
      setJdNotes(draft.notes)
      setReviewing(true)
      toast.success('Job description analysed', {
        description: 'Review every field below before creating the role — nothing is saved yet.',
      })
    },
    onError: (error: Error) => toast.error('Could not analyse this text', { description: error.message }),
  })

  const suggestSkills = useMutation({
    mutationFn: () => api.jobs.suggestSkills(title, description),
    onError: (error: Error) => toast.error('Could not suggest skills', { description: error.message }),
  })

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      job ? api.jobs.update(job.id, payload as never) : api.jobs.create(payload as never),
    onSuccess: (saved) => {
      toast.success(job ? 'Role updated' : 'Role created', {
        description: job
          ? 'All candidates were re-scored against the new criteria.'
          : `${saved.candidate_count} candidates scored against this role.`,
      })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      onDone()
    },
    onError: (error: Error) =>
      setErrors({ form: error.message }),
  })

  function validate() {
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'Give the role a title.'
    if (!requiredSkills.length) next.required_skills = 'Add at least one required skill.'
    const years = Number(experience)
    if (Number.isNaN(years) || years < 0 || years > 50)
      next.required_experience = 'Enter a number between 0 and 50.'
    if (experienceMax && Number(experienceMax) < years)
      next.required_experience = 'The maximum cannot be below the minimum.'
    if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax))
      next.salary = 'Minimum salary cannot exceed the maximum.'
    const weightTotal = weightsTotalPercent(weights)
    if (Math.abs(weightTotal - 100) > 0.5)
      next.weights = `Scoring weights must total exactly 100% — currently ${weightTotal.toFixed(0)}%.`
    setErrors(next)
    if (Object.keys(next).length) {
      // Focus the summary so screen readers announce every problem at once.
      requestAnimationFrame(() => errorSummaryRef.current?.focus())
      return false
    }
    return true
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return

    save.mutate({
      title: title.trim(),
      department: department.trim() || null,
      industry: industry.trim() || null,
      employment_type: employmentType === NONE ? null : employmentType,
      work_mode: workMode === NONE ? null : workMode,
      seniority: seniority === NONE ? null : seniority,
      description: description.trim(),
      required_skills: requiredSkills,
      nice_to_have_skills: niceSkills,
      required_experience: Number(experience) || 0,
      required_experience_max: experienceMax ? Number(experienceMax) : null,
      required_education: education === 'Any' ? null : education,
      location: location.trim() || null,
      remote_ok: remoteOk,
      salary_min: salaryMin ? Number(salaryMin) : null,
      salary_max: salaryMax ? Number(salaryMax) : null,
      status,
      weights,
    })
  }

  const errorList = Object.entries(errors).filter(([key]) => key !== 'form')
  const suggestions = (suggestSkills.data?.skills ?? []).filter(
    (skill) => !requiredSkills.includes(skill) && !niceSkills.includes(skill),
  )

  // Paste-JD is a gate in front of the same form below, not a separate
  // screen — the recruiter always lands on the ordinary fields to review
  // and edit before anything is created.
  if (!job && mode === 'paste' && !reviewing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
            <Wand2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs">
              <span className="font-semibold">Paste a job description</span> and TalentRank will
              draft the structured fields below — title, seniority, experience, skills, education,
              location — for you to review and edit. Nothing is created until you confirm.
            </p>
          </div>
          <Field label="Job description" htmlFor="jd-paste">
            <Textarea
              id="jd-paste"
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
              rows={14}
              placeholder="Paste the full job description here…"
              autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setMode('manual')}>
            Fill in manually instead
          </Button>
          <Button
            type="button"
            onClick={() => parseJD.mutate()}
            loading={parseJD.isPending}
            disabled={!jdText.trim()}
          >
            <Sparkles aria-hidden="true" />
            Analyse description
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="space-y-5">
        {!job && !reviewing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode('paste')}
            className="w-full justify-center"
          >
            <ClipboardPaste aria-hidden="true" />
            Paste a job description instead
          </Button>
        )}

        {reviewing && (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Wand2 className="size-3.5" aria-hidden="true" />
              Drafted from your job description — review every field before creating.
            </p>
            {jdNotes.length > 0 && (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {jdNotes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(errors.form || errorList.length > 0) && (
          <div
            ref={errorSummaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            <p className="font-semibold">
              {errors.form ?? `Fix ${errorList.length} field${errorList.length === 1 ? '' : 's'} to continue:`}
            </p>
            {errorList.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {errorList.map(([key, message]) => (
                  <li key={key}>
                    <a href={`#job-${key}`} className="underline underline-offset-2">
                      {message}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" htmlFor="job-title" required error={errors.title}>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senior Data Scientist"
            />
          </Field>
          <Field label="Department" htmlFor="job-department">
            <Input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Data & AI"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Industry" htmlFor="job-industry">
            <Input
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Fintech"
            />
          </Field>
          <Field label="Seniority" htmlFor="job-seniority">
            <Select value={seniority} onValueChange={(v) => setSeniority(v as Seniority)}>
              <SelectTrigger id="job-seniority">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {SENIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment type" htmlFor="job-employment">
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger id="job-employment">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {EMPLOYMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Work mode" htmlFor="job-work-mode" hint="Remote sets remote-friendly automatically">
            <Select
              value={workMode}
              onValueChange={(v) => {
                setWorkMode(v as WorkMode)
                setRemoteOk(v === 'remote')
              }}
            >
              <SelectTrigger id="job-work-mode">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {WORK_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          label="Job description"
          htmlFor="job-description"
          hint="This text is compared against each resume for the relevance score — the more specific, the better the matching."
        >
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            placeholder="What the person will own, the problems they will work on, and the environment they will work in."
          />
        </Field>

        <SkillEditor
          id="job-required_skills"
          label="Required skills"
          required
          error={errors.required_skills}
          hint="Matched exactly and semantically — “ML” will match “machine learning”."
          value={requiredSkills}
          onChange={setRequiredSkills}
        />

        <SkillEditor
          id="job-nice"
          label="Preferred (nice to have)"
          hint="Shown to candidates as extra credit — never required for the required-skills score."
          value={niceSkills}
          onChange={setNiceSkills}
        />

        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Lightbulb className="size-3.5 text-primary" aria-hidden="true" />
              Skill suggestions
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => suggestSkills.mutate()}
              loading={suggestSkills.isPending}
              disabled={!title.trim() && !description.trim()}
            >
              <Sparkles aria-hidden="true" />
              Suggest from title &amp; description
            </Button>
          </div>
          {suggestSkills.isSuccess && (
            suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card py-0.5 pl-2 pr-1 text-xs"
                  >
                    {skill}
                    <Tooltip content="Add as required">
                      <button
                        type="button"
                        onClick={() => setRequiredSkills((prev) => [...new Set([...prev, skill])])}
                        className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Add ${skill} as required`}
                      >
                        <Plus className="size-3" aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Add as preferred">
                      <button
                        type="button"
                        onClick={() => setNiceSkills((prev) => [...new Set([...prev, skill])])}
                        className="cursor-pointer rounded px-1 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Add ${skill} as preferred`}
                      >
                        P
                      </button>
                    </Tooltip>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Every suggestion is already on this role.
              </p>
            )
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum experience"
            htmlFor="job-required_experience"
            error={errors.required_experience}
            hint="Years"
          >
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              inputMode="decimal"
              value={experience}
              onChange={(event) => setExperience(event.target.value)}
            />
          </Field>
          <Field label="Maximum experience" htmlFor="job-required_experience_max" hint="Years, optional">
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              inputMode="decimal"
              value={experienceMax}
              onChange={(event) => setExperienceMax(event.target.value)}
              placeholder="No maximum"
            />
          </Field>
          <Field label="Minimum education" htmlFor="job-education">
            <Select value={education} onValueChange={setEducation}>
              <SelectTrigger id="job-education">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="job-status">
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger id="job-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location" htmlFor="job-location">
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Bangalore"
              disabled={remoteOk}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={remoteOk} onCheckedChange={setRemoteOk} />
          <span>Remote friendly</span>
          <span className="text-xs text-muted-foreground">(everyone scores full marks on location)</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salary minimum" htmlFor="job-salary-min" error={errors.salary} hint="Annual, in rupees">
            <Input
              type="number"
              inputMode="numeric"
              value={salaryMin}
              onChange={(event) => setSalaryMin(event.target.value)}
              placeholder="1600000"
            />
          </Field>
          <Field label="Salary maximum" htmlFor="job-salary-max">
            <Input
              type="number"
              inputMode="numeric"
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
              placeholder="2800000"
            />
          </Field>
        </div>

        <div id="job-weights" className={cn('rounded-md border p-4', errors.weights ? 'border-destructive' : 'border-border')}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scoring weights
          </h3>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            How much each dimension counts for this role's ranking. Must total exactly 100%.
          </p>
          <WeightSliders value={weights} onChange={setWeights} />
        </div>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {job ? 'Save changes' : 'Create role'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SkillEditor({
  id,
  label,
  value,
  onChange,
  required,
  error,
  hint,
}: {
  id: string
  label: string
  value: string[]
  onChange: (next: string[]) => void
  required?: boolean
  error?: string
  hint?: string
}) {
  const [draft, setDraft] = React.useState('')

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
    if (!parts.length) return
    onChange([...new Set([...value, ...parts])])
    setDraft('')
  }

  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}>
      <div
        className={cn(
          'rounded-md border bg-card p-2',
          error ? 'border-destructive' : 'border-input',
        )}
      >
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {value.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((item) => item !== skill))}
                  className="cursor-pointer rounded-sm p-0.5 transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                add(draft)
              } else if (event.key === 'Backspace' && !draft && value.length) {
                onChange(value.slice(0, -1))
              }
            }}
            placeholder="Type a skill and press Enter"
            className="h-8 border-0 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => add(draft)}
            disabled={!draft.trim()}
            aria-label={`Add ${label.toLowerCase()}`}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Field>
  )
}
