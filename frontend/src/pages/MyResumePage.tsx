import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  FileUp,
  FolderKanban,
  GraduationCap,
  Lightbulb,
  ListChecks,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { profileCompleteness } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui/primitives'
import { PageBody, PageHeader, StatCard } from '@/components/app/shared'
import { HealthReportPanel } from '@/components/app/HealthReportPanel'
import { RoleMatchCard } from '@/components/app/RoleMatchCard'
import type {
  CandidateDetail,
  CertificationItem,
  EducationItem,
  ProjectItem,
  WorkExperienceItem,
} from '@/types'

const EDUCATION_OPTIONS = ['High School', 'Diploma / Associate', 'Bachelors', 'Masters', 'PhD']

export function MyResumePage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'

  const { data: candidate, isLoading, error } = useQuery({
    queryKey: ['my-resume'],
    queryFn: api.candidates.me,
    retry: false,
  })

  const { data: roleMatches, isLoading: matchesLoading } = useQuery({
    queryKey: ['my-matches'],
    queryFn: api.candidates.myMatches,
    enabled: !!candidate,
    retry: false,
  })

  if (isLoading) {
    return (
      <PageBody className="mx-auto max-w-4xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageBody>
    )
  }

  if (error || !candidate) {
    return (
      <>
        <PageHeader
          title="My career dashboard"
          description="See exactly how an applicant tracking system reads your resume, which roles you match, and what to do next."
        />
        <PageBody className="mx-auto max-w-3xl">
          <EmptyState
            icon={FileUp}
            title="No resume on file yet"
            description="Upload your resume and we will show you every field that was extracted, which open roles you match, and a health check telling you what to fix before you apply."
            action={
              <Button asChild>
                <Link to="/upload">
                  <FileUp aria-hidden="true" />
                  Upload my resume
                </Link>
              </Button>
            }
          />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="My career dashboard"
        description="Where you stand, which roles you match, and exactly what would improve each score."
        actions={
          candidate.verified_by_candidate ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Verified by you
            </Badge>
          ) : (
            <Badge variant="warning">Not yet reviewed</Badge>
          )
        }
      />

      <PageBody className="mx-auto max-w-4xl">
        <Tabs value={tab} onValueChange={(value) => setParams({ tab: value })}>
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="matches">
              Job matches
              {roleMatches && roleMatches.length > 0 && (
                <span className="tabular ml-1 rounded bg-muted-foreground/20 px-1 text-[10px]">
                  {roleMatches.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="health">
              Resume health
              <span className="tabular ml-1 rounded bg-muted-foreground/20 px-1 text-[10px]">
                {Math.round(candidate.health_score)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="edit">Edit profile</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab candidate={candidate} roleMatches={roleMatches} loadingMatches={matchesLoading} />
          </TabsContent>

          <TabsContent value="matches">
            <JobMatchesTab roleMatches={roleMatches} loading={matchesLoading} />
          </TabsContent>

          <TabsContent value="health">
            <Card>
              <CardHeader>
                <CardTitle>Resume health check</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Applicant tracking systems read files, not people. These are the things that make
                  yours hard to read.
                </p>
              </CardHeader>
              <CardContent>
                {candidate.health_report ? (
                  <HealthReportPanel report={candidate.health_report} />
                ) : (
                  <p className="text-sm text-muted-foreground">No health report available.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit">
            <CorrectionForm candidate={candidate} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Overview — "where do I stand, what should I do next"                       */
/* -------------------------------------------------------------------------- */
function OverviewTab({
  candidate,
  roleMatches,
  loadingMatches,
}: {
  candidate: CandidateDetail
  roleMatches: Awaited<ReturnType<typeof api.candidates.myMatches>> | undefined
  loadingMatches: boolean
}) {
  const completeness = profileCompleteness(candidate)
  const bestMatch = roleMatches && roleMatches.length > 0 ? roleMatches[0] : null
  // Skills that would help across the most roles right now, not just one.
  const skillFrequency = new Map<string, number>()
  for (const role of roleMatches ?? []) {
    for (const skill of role.missing_skills) {
      skillFrequency.set(skill, (skillFrequency.get(skill) ?? 0) + 1)
    }
  }
  const topMissingSkills = [...skillFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Resume health"
          value={`${Math.round(candidate.health_score)}/100`}
          hint={candidate.health_score >= 70 ? 'Reads cleanly' : 'Needs attention'}
          icon={ShieldCheck}
          tone={candidate.health_score >= 70 ? 'success' : 'warning'}
        />
        <StatCard
          label="Profile completeness"
          value={`${completeness.percent}%`}
          hint={completeness.missing.length ? `${completeness.missing.length} thing(s) to add` : 'Complete'}
          icon={ListChecks}
          tone={completeness.percent >= 80 ? 'success' : 'default'}
        />
        <StatCard
          label="Best role match"
          value={bestMatch ? `${Math.round(bestMatch.overall_score * 100)}%` : '—'}
          hint={bestMatch ? bestMatch.job.title : loadingMatches ? 'Loading…' : 'No open roles yet'}
          icon={Target}
          tone={bestMatch && bestMatch.overall_score >= 0.7 ? 'success' : 'primary'}
        />
        <StatCard
          label="Skills on file"
          value={candidate.skills.length}
          hint={`${candidate.projects.length} project(s) · ${candidate.certifications.length} certification(s)`}
          icon={Sparkles}
          tone="accent"
        />
      </div>

      {completeness.missing.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <ListChecks className="size-4 text-primary" aria-hidden="true" />
            Complete your profile
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            A more complete profile scores better on every dimension and shows up in more searches.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {completeness.missing.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs">
                <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/my-resume?tab=edit">Edit my profile</Link>
          </Button>
        </Card>
      )}

      {topMissingSkills.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <Target className="size-4 text-primary" aria-hidden="true" />
            Skills that would help you the most
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Missing from the roles you're currently being scored against, ranked by how many roles
            ask for them.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topMissingSkills.map(([skill, count]) => (
              <Badge key={skill} variant="outline" className="gap-1 font-normal">
                {skill}
                <span className="tabular text-[10px] text-muted-foreground">×{count}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {bestMatch && bestMatch.recommendations.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <Lightbulb className="size-4 text-primary" aria-hidden="true" />
            What to do next, for {bestMatch.job.title}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Your closest-matching open role right now — see the Job matches tab for every role.
          </p>
          <ul className="space-y-1.5">
            {bestMatch.recommendations.slice(0, 4).map((rec, index) => (
              <li key={index} className="rounded-md border border-border p-2.5 text-xs">
                <span className="font-semibold">{rec.title}</span>
                <p className="mt-0.5 text-muted-foreground">{rec.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!loadingMatches && !roleMatches?.length && (
        <EmptyState
          icon={Target}
          title="No open roles to match against yet"
          description="When recruiters open a role, you'll see your match score, skill gap and what to improve here."
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Job matches — "Roles you match"                                            */
/* -------------------------------------------------------------------------- */
function JobMatchesTab({
  roleMatches,
  loading,
}: {
  roleMatches: Awaited<ReturnType<typeof api.candidates.myMatches>> | undefined
  loading: boolean
}) {
  const [expanded, setExpanded] = React.useState<number | null>(null)

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!roleMatches?.length) {
    return (
      <EmptyState
        icon={Target}
        title="No open roles to match against yet"
        description="Once a recruiter opens a role, it will appear here with your score, matched and missing skills, and what would improve your fit."
      />
    )
  }

  return (
    <div className="space-y-3">
      {roleMatches.map((role) => (
        <RoleMatchCard
          key={role.job.id}
          role={role}
          expanded={expanded === role.job.id}
          onToggle={() => setExpanded((current) => (current === role.job.id ? null : role.job.id))}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Edit profile                                                               */
/* -------------------------------------------------------------------------- */
function CorrectionForm({ candidate }: { candidate: CandidateDetail }) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = React.useState(candidate.full_name ?? '')
  const [email, setEmail] = React.useState(candidate.email ?? '')
  const [phone, setPhone] = React.useState(candidate.phone ?? '')
  const [location, setLocation] = React.useState(candidate.location ?? '')
  const [headline, setHeadline] = React.useState(candidate.headline ?? '')
  const [experienceYears, setExperienceYears] = React.useState(String(candidate.total_experience))
  const [education, setEducation] = React.useState(candidate.highest_qualification ?? '')
  const [university, setUniversity] = React.useState(candidate.university ?? '')
  const [linkedin, setLinkedin] = React.useState(candidate.linkedin_url ?? '')
  const [github, setGithub] = React.useState(candidate.github_url ?? '')
  const [skills, setSkills] = React.useState<string[]>(candidate.skills.map((s) => s.name))
  const [draft, setDraft] = React.useState('')

  const [experiences, setExperiences] = React.useState<Omit<WorkExperienceItem, 'id'>[]>(
    candidate.experiences.map(({ id: _id, ...rest }) => rest),
  )
  const [educations, setEducations] = React.useState<Omit<EducationItem, 'id'>[]>(
    candidate.educations.map(({ id: _id, ...rest }) => rest),
  )
  const [projects, setProjects] = React.useState<Omit<ProjectItem, 'id'>[]>(
    candidate.projects.map(({ id: _id, ...rest }) => rest),
  )
  const [certifications, setCertifications] = React.useState<Omit<CertificationItem, 'id'>[]>(
    candidate.certifications.map(({ id: _id, ...rest }) => rest),
  )

  const save = useMutation({
    mutationFn: () =>
      api.candidates.update(candidate.id, {
        full_name: fullName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        location: location.trim() || null,
        headline: headline.trim() || null,
        total_experience: Number(experienceYears) || 0,
        highest_qualification: education || null,
        university: university.trim() || null,
        linkedin_url: linkedin.trim() || null,
        github_url: github.trim() || null,
        skills,
        experiences,
        educations,
        projects,
        certifications,
      }),
    onSuccess: () => {
      toast.success('Saved', {
        description: 'Your corrections are now used for every role you are matched against.',
      })
      queryClient.invalidateQueries({ queryKey: ['my-resume'] })
      queryClient.invalidateQueries({ queryKey: ['my-matches'] })
    },
    onError: (error: Error) => toast.error('Could not save', { description: error.message }),
  })

  const addSkill = (raw: string) => {
    const parts = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    setSkills([...new Set([...skills, ...parts])])
    setDraft('')
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
      className="space-y-4"
    >
      {!candidate.verified_by_candidate && (
        <div className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs">
            <span className="font-semibold">Check these details.</span> Resume parsing is imperfect —
            names glued to job titles, missing phone numbers and mis-read dates are common. Anything
            you correct here is what recruiters actually match against.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="my-name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Headline" htmlFor="my-headline" hint="Your current role in a few words">
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="my-email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </Field>
          <Field label="Phone" htmlFor="my-phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
          </Field>
          <Field label="Location" htmlFor="my-location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bangalore" />
          </Field>
          <Field label="LinkedIn" htmlFor="my-linkedin">
            <Input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </Field>
          <Field label="GitHub" htmlFor="my-github">
            <Input type="url" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/…" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience &amp; education</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Years of experience" htmlFor="my-experience">
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              inputMode="decimal"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
            />
          </Field>
          <Field label="Highest qualification" htmlFor="my-education">
            <Select value={education} onValueChange={setEducation}>
              <SelectTrigger id="my-education">
                <SelectValue placeholder="Select" />
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
          <Field label="University" htmlFor="my-university">
            <Input value={university} onChange={(e) => setUniversity(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills ({skills.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            Add anything that was missed, and remove anything picked up by mistake.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  onClick={() => setSkills(skills.filter((item) => item !== skill))}
                  className="cursor-pointer rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
            {skills.length === 0 && (
              <p className="text-sm text-muted-foreground">No skills yet — add your first below.</p>
            )}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  addSkill(draft)
                }
              }}
              placeholder="Type a skill and press Enter"
              aria-label="Add a skill"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => addSkill(draft)} disabled={!draft.trim()} aria-label="Add skill">
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <ExperienceCard experiences={experiences} onChange={setExperiences} />
      <EducationCard educations={educations} onChange={setEducations} />
      <ProjectsCard projects={projects} onChange={setProjects} />
      <CertificationsCard certifications={certifications} onChange={setCertifications} />

      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          Saving marks your profile as verified and re-scores you against every open role.
        </p>
        <Button type="submit" loading={save.isPending}>
          <Save aria-hidden="true" />
          Save corrections
        </Button>
      </div>
    </form>
  )
}

/** Shared row chrome for every repeatable list below: a card with a delete
 * button, so WorkExperience/Education/Project/Certification only differ in
 * which fields they render inside. */
function EditableRow({
  onRemove,
  children,
}: {
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
        aria-label="Remove entry"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}

function ExperienceCard({
  experiences,
  onChange,
}: {
  experiences: Omit<WorkExperienceItem, 'id'>[]
  onChange: (next: Omit<WorkExperienceItem, 'id'>[]) => void
}) {
  const update = (index: number, patch: Partial<Omit<WorkExperienceItem, 'id'>>) =>
    onChange(experiences.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Briefcase className="size-4 text-muted-foreground" aria-hidden="true" />
          Work experience ({experiences.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          A one-line description with a measurable outcome is worth more than a job title alone.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {experiences.map((item, index) => (
          <EditableRow key={index} onRemove={() => onChange(experiences.filter((_, i) => i !== index))}>
            <Field label="Title" htmlFor={`exp-title-${index}`}>
              <Input id={`exp-title-${index}`} value={item.title ?? ''} onChange={(e) => update(index, { title: e.target.value })} />
            </Field>
            <Field label="Company" htmlFor={`exp-company-${index}`}>
              <Input id={`exp-company-${index}`} value={item.company ?? ''} onChange={(e) => update(index, { company: e.target.value })} />
            </Field>
            <Field label="Start date" htmlFor={`exp-start-${index}`} hint="e.g. Jan 2021">
              <Input id={`exp-start-${index}`} value={item.start_date ?? ''} onChange={(e) => update(index, { start_date: e.target.value })} />
            </Field>
            <Field label="End date" htmlFor={`exp-end-${index}`} hint='e.g. "Present"'>
              <Input id={`exp-end-${index}`} value={item.end_date ?? ''} onChange={(e) => update(index, { end_date: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor={`exp-desc-${index}`} className="sm:col-span-2">
              <Textarea
                id={`exp-desc-${index}`}
                value={item.description ?? ''}
                onChange={(e) => update(index, { description: e.target.value })}
                rows={2}
                placeholder='What you owned and its measurable impact, e.g. "cut API latency by 30%".'
              />
            </Field>
          </EditableRow>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...experiences, { company: '', title: '', start_date: '', end_date: '', description: '' }])}
        >
          <Plus aria-hidden="true" />
          Add work experience
        </Button>
      </CardContent>
    </Card>
  )
}

function EducationCard({
  educations,
  onChange,
}: {
  educations: Omit<EducationItem, 'id'>[]
  onChange: (next: Omit<EducationItem, 'id'>[]) => void
}) {
  const update = (index: number, patch: Partial<Omit<EducationItem, 'id'>>) =>
    onChange(educations.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />
          Education ({educations.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {educations.map((item, index) => (
          <EditableRow key={index} onRemove={() => onChange(educations.filter((_, i) => i !== index))}>
            <Field label="Degree" htmlFor={`edu-degree-${index}`}>
              <Input id={`edu-degree-${index}`} value={item.degree ?? ''} onChange={(e) => update(index, { degree: e.target.value })} />
            </Field>
            <Field label="Field of study" htmlFor={`edu-field-${index}`}>
              <Input id={`edu-field-${index}`} value={item.field_of_study ?? ''} onChange={(e) => update(index, { field_of_study: e.target.value })} />
            </Field>
            <Field label="Institution" htmlFor={`edu-institution-${index}`}>
              <Input id={`edu-institution-${index}`} value={item.institution ?? ''} onChange={(e) => update(index, { institution: e.target.value })} />
            </Field>
            <Field label="Graduation year" htmlFor={`edu-year-${index}`}>
              <Input id={`edu-year-${index}`} value={item.graduation_year ?? ''} onChange={(e) => update(index, { graduation_year: e.target.value })} />
            </Field>
          </EditableRow>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...educations, { degree: '', field_of_study: '', institution: '', graduation_year: '' }])}
        >
          <Plus aria-hidden="true" />
          Add education
        </Button>
      </CardContent>
    </Card>
  )
}

function ProjectsCard({
  projects,
  onChange,
}: {
  projects: Omit<ProjectItem, 'id'>[]
  onChange: (next: Omit<ProjectItem, 'id'>[]) => void
}) {
  const update = (index: number, patch: Partial<Omit<ProjectItem, 'id'>>) =>
    onChange(projects.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <FolderKanban className="size-4 text-muted-foreground" aria-hidden="true" />
          Projects ({projects.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Naming the technologies you used is what lets the projects score actually credit them —
          the description alone isn't matched against required skills.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.map((item, index) => (
          <EditableRow key={index} onRemove={() => onChange(projects.filter((_, i) => i !== index))}>
            <Field label="Name" htmlFor={`proj-name-${index}`}>
              <Input id={`proj-name-${index}`} value={item.name} onChange={(e) => update(index, { name: e.target.value })} />
            </Field>
            <Field label="Link" htmlFor={`proj-url-${index}`}>
              <Input id={`proj-url-${index}`} type="url" value={item.url ?? ''} onChange={(e) => update(index, { url: e.target.value })} placeholder="https://github.com/…" />
            </Field>
            <Field label="Technologies" htmlFor={`proj-tech-${index}`} className="sm:col-span-2" hint="Comma-separated">
              <Input
                id={`proj-tech-${index}`}
                value={item.technologies.join(', ')}
                onChange={(e) => update(index, { technologies: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })}
                placeholder="python, docker, postgresql"
              />
            </Field>
            <Field label="Description" htmlFor={`proj-desc-${index}`} className="sm:col-span-2">
              <Textarea
                id={`proj-desc-${index}`}
                value={item.description ?? ''}
                onChange={(e) => update(index, { description: e.target.value })}
                rows={2}
              />
            </Field>
          </EditableRow>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...projects, { name: '', description: '', technologies: [], url: '', start_date: '', end_date: '' }])}
        >
          <Plus aria-hidden="true" />
          Add project
        </Button>
      </CardContent>
    </Card>
  )
}

function CertificationsCard({
  certifications,
  onChange,
}: {
  certifications: Omit<CertificationItem, 'id'>[]
  onChange: (next: Omit<CertificationItem, 'id'>[]) => void
}) {
  const update = (index: number, patch: Partial<Omit<CertificationItem, 'id'>>) =>
    onChange(certifications.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Award className="size-4 text-muted-foreground" aria-hidden="true" />
          Certifications ({certifications.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {certifications.map((item, index) => (
          <EditableRow key={index} onRemove={() => onChange(certifications.filter((_, i) => i !== index))}>
            <Field label="Name" htmlFor={`cert-name-${index}`}>
              <Input id={`cert-name-${index}`} value={item.name} onChange={(e) => update(index, { name: e.target.value })} />
            </Field>
            <Field label="Issuer" htmlFor={`cert-issuer-${index}`}>
              <Input id={`cert-issuer-${index}`} value={item.issuer ?? ''} onChange={(e) => update(index, { issuer: e.target.value })} />
            </Field>
            <Field label="Issue date" htmlFor={`cert-date-${index}`}>
              <Input id={`cert-date-${index}`} value={item.issue_date ?? ''} onChange={(e) => update(index, { issue_date: e.target.value })} />
            </Field>
            <Field label="Credential link" htmlFor={`cert-url-${index}`}>
              <Input id={`cert-url-${index}`} type="url" value={item.credential_url ?? ''} onChange={(e) => update(index, { credential_url: e.target.value })} />
            </Field>
          </EditableRow>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...certifications, { name: '', issuer: '', issue_date: '', credential_url: '' }])}
        >
          <Plus aria-hidden="true" />
          Add certification
        </Button>
        {certifications.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            None on file — add any that are relevant to the roles you're targeting.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
