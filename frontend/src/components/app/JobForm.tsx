import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
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
} from '@/components/ui/primitives'
import { WeightSliders } from '@/components/app/WeightSliders'
import type { Job, JobWeights } from '@/types'

const DEFAULT_WEIGHTS: JobWeights = {
  skills: 0.35,
  experience: 0.25,
  education: 0.15,
  semantic: 0.15,
  location: 0.1,
}

const EDUCATION_OPTIONS = [
  'Any',
  'High School',
  'Diploma / Associate',
  'Bachelors',
  'Masters',
  'PhD',
]

export function JobForm({ job, onDone }: { job: Job | null; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const errorSummaryRef = React.useRef<HTMLDivElement>(null)

  const [title, setTitle] = React.useState(job?.title ?? '')
  const [department, setDepartment] = React.useState(job?.department ?? '')
  const [description, setDescription] = React.useState(job?.description ?? '')
  const [requiredSkills, setRequiredSkills] = React.useState<string[]>(job?.required_skills ?? [])
  const [niceSkills, setNiceSkills] = React.useState<string[]>(job?.nice_to_have_skills ?? [])
  const [experience, setExperience] = React.useState(String(job?.required_experience ?? 0))
  const [education, setEducation] = React.useState(job?.required_education ?? 'Any')
  const [location, setLocation] = React.useState(job?.location ?? '')
  const [remoteOk, setRemoteOk] = React.useState(job?.remote_ok ?? false)
  const [salaryMin, setSalaryMin] = React.useState(job?.salary_min ? String(job.salary_min) : '')
  const [salaryMax, setSalaryMax] = React.useState(job?.salary_max ? String(job.salary_max) : '')
  const [status, setStatus] = React.useState(job?.status ?? 'active')
  const [weights, setWeights] = React.useState<JobWeights>(job?.weights ?? DEFAULT_WEIGHTS)

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
    if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax))
      next.salary = 'Minimum salary cannot exceed the maximum.'
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
      description: description.trim(),
      required_skills: requiredSkills,
      nice_to_have_skills: niceSkills,
      required_experience: Number(experience) || 0,
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="space-y-5">
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
          label="Nice to have"
          hint="Counted towards relevance, but never towards the required-skills score."
          value={niceSkills}
          onChange={setNiceSkills}
        />

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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="job-location">
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Bangalore"
              disabled={remoteOk}
            />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={remoteOk} onCheckedChange={setRemoteOk} />
              <span>Remote friendly</span>
              <span className="text-xs text-muted-foreground">(everyone scores full marks on location)</span>
            </label>
          </div>
        </div>

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

        <div className="rounded-md border border-border p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scoring weights
          </h3>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            How much each dimension counts for this role. A senior hire usually leans on experience;
            a startup role leans on skills.
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
