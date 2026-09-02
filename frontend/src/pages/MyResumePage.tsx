import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileUp, Plus, Save, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
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
} from '@/components/ui/primitives'
import { PageBody, PageHeader } from '@/components/app/shared'
import { HealthReportPanel } from '@/components/app/HealthReportPanel'

const EDUCATION_OPTIONS = ['High School', 'Diploma / Associate', 'Bachelors', 'Masters', 'PhD']

export function MyResumePage() {
  const queryClient = useQueryClient()

  const { data: candidate, isLoading, error } = useQuery({
    queryKey: ['my-resume'],
    queryFn: api.candidates.me,
    retry: false,
  })

  if (isLoading) {
    return (
      <PageBody className="mx-auto max-w-3xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageBody>
    )
  }

  if (error || !candidate) {
    return (
      <>
        <PageHeader
          title="My resume"
          description="See exactly how an applicant tracking system reads your resume — and fix anything it got wrong."
        />
        <PageBody className="mx-auto max-w-3xl">
          <EmptyState
            icon={FileUp}
            title="No resume on file yet"
            description="Upload your resume and we will show you every field that was extracted, plus a health check telling you what to fix before you apply."
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
        title="My resume"
        description="This is exactly what recruiters' systems extracted. Correct anything that is wrong — your changes are used for matching."
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

      <PageBody className="mx-auto max-w-3xl">
        <Tabs defaultValue="details">
          <TabsList className="mb-4">
            <TabsTrigger value="details">What we extracted</TabsTrigger>
            <TabsTrigger value="health">
              Resume health
              <span className="tabular ml-1 rounded bg-muted-foreground/20 px-1 text-[10px]">
                {Math.round(candidate.health_score)}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <CorrectionForm candidate={candidate} />
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
        </Tabs>
      </PageBody>
    </>
  )
}

function CorrectionForm({
  candidate,
}: {
  candidate: NonNullable<Awaited<ReturnType<typeof api.candidates.me>>>
}) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = React.useState(candidate.full_name ?? '')
  const [email, setEmail] = React.useState(candidate.email ?? '')
  const [phone, setPhone] = React.useState(candidate.phone ?? '')
  const [location, setLocation] = React.useState(candidate.location ?? '')
  const [headline, setHeadline] = React.useState(candidate.headline ?? '')
  const [experience, setExperience] = React.useState(String(candidate.total_experience))
  const [education, setEducation] = React.useState(candidate.highest_qualification ?? '')
  const [university, setUniversity] = React.useState(candidate.university ?? '')
  const [linkedin, setLinkedin] = React.useState(candidate.linkedin_url ?? '')
  const [github, setGithub] = React.useState(candidate.github_url ?? '')
  const [skills, setSkills] = React.useState<string[]>(candidate.skills.map((s) => s.name))
  const [draft, setDraft] = React.useState('')

  const save = useMutation({
    mutationFn: () =>
      api.candidates.update(candidate.id, {
        full_name: fullName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        location: location.trim() || null,
        headline: headline.trim() || null,
        total_experience: Number(experience) || 0,
        highest_qualification: education || null,
        university: university.trim() || null,
        linkedin_url: linkedin.trim() || null,
        github_url: github.trim() || null,
        skills,
      }),
    onSuccess: () => {
      toast.success('Saved', {
        description: 'Your corrections are now used for every role you are matched against.',
      })
      queryClient.invalidateQueries({ queryKey: ['my-resume'] })
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
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
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
