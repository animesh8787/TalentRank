import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import {
  Building2,
  ExternalLink,
  FileText,
  Github,
  GraduationCap,
  Linkedin,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  Quote,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { DIMENSION_META, STAGE_META, STAGE_ORDER, cn, formatRelative, pct } from '@/lib/utils'
import {
  Badge,
  Button,
  Dialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SheetContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
} from '@/components/ui/primitives'
import {
  Avatar,
  ChipRow,
  HealthPill,
  ScoreBadge,
  ScoreBreakdown,
  SkillChip,
} from '@/components/app/shared'
import type { MatchDetail, PipelineStage } from '@/types'

export function CandidateDrawer({
  matchId,
  onOpenChange,
}: {
  matchId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api.matches.get(matchId as number),
    enabled: matchId !== null,
  })

  const { data: resume } = useQuery({
    queryKey: ['candidate', match?.candidate_id],
    queryFn: () => api.candidates.get(match!.candidate_id),
    enabled: !!match,
  })

  const stageMutation = useMutation({
    mutationFn: (stage: PipelineStage) => api.matches.setStage(matchId as number, stage),
    onSuccess: (_data, stage) => {
      toast.success(`Moved to ${STAGE_META[stage].label}`)
      queryClient.invalidateQueries({ queryKey: ['match', matchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error: Error) => toast.error('Could not update stage', { description: error.message }),
  })

  return (
    <Dialog open={matchId !== null} onOpenChange={onOpenChange}>
      <SheetContent width="sm:max-w-3xl" aria-describedby={undefined}>
        {isLoading || !match ? (
          <DrawerSkeleton />
        ) : (
          <DrawerContent
            match={match}
            resumeText={resume?.resume_text ?? ''}
            onStageChange={(stage) => stageMutation.mutate(stage)}
            stagePending={stageMutation.isPending}
          />
        )}
      </SheetContent>
    </Dialog>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function DrawerContent({
  match,
  resumeText,
  onStageChange,
  stagePending,
}: {
  match: MatchDetail
  resumeText: string
  onStageChange: (stage: PipelineStage) => void
  stagePending: boolean
}) {
  const candidate = match.candidate
  const explanation = match.explanation
  const anonymized = candidate.is_anonymized

  return (
    <>
      {/* Header ------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-border p-4 pr-12">
        <div className="flex items-start gap-3">
          <Avatar name={candidate.full_name} size="lg" anonymized={anonymized} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold tracking-tight">
                {candidate.full_name ?? 'Unnamed candidate'}
              </h2>
              {match.rank > 0 && (
                <Badge variant="outline" className="tabular shrink-0">
                  Rank #{match.rank}
                </Badge>
              )}
              {anonymized && (
                <Badge variant="warning" className="shrink-0">
                  Blind review
                </Badge>
              )}
            </div>
            {candidate.headline && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{candidate.headline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <ContactBits candidate={candidate} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <ScoreBadge score={match.overall_score} size="lg" />
            <HealthPill score={candidate.health_score} />
          </div>
        </div>

        {/* Stage control */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Pipeline stage</span>
          <Select
            value={match.stage}
            onValueChange={(value) => onStageChange(value as PipelineStage)}
            disabled={stagePending}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_ORDER.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('size-2 rounded-full', STAGE_META[stage].dot)}
                      aria-hidden="true"
                    />
                    {STAGE_META[stage].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body -------------------------------------------------------------- */}
      <Tabs defaultValue="why" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="why">Why this score</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="resume">Resume</TabsTrigger>
            <TabsTrigger value="notes">
              Notes
              {match.note_count > 0 && (
                <span className="tabular ml-1 rounded bg-muted-foreground/20 px-1 text-[10px]">
                  {match.note_count}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="why" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          {explanation ? (
            <WhyThisScore explanation={explanation} />
          ) : (
            <p className="text-sm text-muted-foreground">No explanation was recorded for this match.</p>
          )}
        </TabsContent>

        <TabsContent value="profile" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          <ProfileTab match={match} />
        </TabsContent>

        <TabsContent value="resume" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          <ResumeTab
            text={resumeText}
            highlights={(explanation?.matched_skills ?? [])
              .map((skill) => skill.matched_with)
              .filter((value): value is string => !!value)}
          />
        </TabsContent>

        <TabsContent value="notes" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          <NotesTab matchId={match.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function ContactBits({ candidate }: { candidate: MatchDetail['candidate'] }) {
  const bits: React.ReactNode[] = []
  if (candidate.email)
    bits.push(
      <a key="email" href={`mailto:${candidate.email}`} className="flex items-center gap-1 hover:text-foreground hover:underline">
        <Mail className="size-3" aria-hidden="true" />
        {candidate.email}
      </a>,
    )
  if (candidate.phone)
    bits.push(
      <span key="phone" className="flex items-center gap-1">
        <Phone className="size-3" aria-hidden="true" />
        {candidate.phone}
      </span>,
    )
  if (candidate.location)
    bits.push(
      <span key="loc" className="flex items-center gap-1">
        <MapPin className="size-3" aria-hidden="true" />
        {candidate.location}
      </span>,
    )
  if (candidate.linkedin_url)
    bits.push(
      <a key="li" href={candidate.linkedin_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 hover:text-foreground hover:underline">
        <Linkedin className="size-3" aria-hidden="true" />
        LinkedIn
      </a>,
    )
  if (candidate.github_url)
    bits.push(
      <a key="gh" href={candidate.github_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 hover:text-foreground hover:underline">
        <Github className="size-3" aria-hidden="true" />
        GitHub
      </a>,
    )

  if (!bits.length) {
    return <span className="italic">Contact details hidden</span>
  }
  return <>{bits}</>
}

/* -------------------------------------------------------------------------- */
/* "Why this score" — the explainability core                                 */
/* -------------------------------------------------------------------------- */
function WhyThisScore({ explanation }: { explanation: NonNullable<MatchDetail['explanation']> }) {
  const radarData = DIMENSION_META.map((meta) => ({
    dimension: meta.label,
    score: Math.round((explanation.dimensions[meta.key]?.score ?? 0) * 100),
  }))

  const matched = explanation.matched_skills ?? []
  const missing = explanation.missing_skills ?? []

  return (
    <div className="space-y-5">
      <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
        {explanation.summary}
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Radar gives shape at a glance; the bars below give exact values. */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fit profile
          </h3>
          <div className="h-56" role="img" aria-label={radarSummary(radarData)}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.22}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dimension breakdown
          </h3>
          <ScoreBreakdown dimensions={explanation.dimensions} />
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Required skills
        </h3>
        {matched.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-success">
              Present ({matched.length})
            </p>
            <ChipRow
              items={matched}
              max={12}
              render={(skill, index) => <SkillChip key={index} skill={skill} />}
            />
          </div>
        )}
        {missing.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-destructive">Missing ({missing.length})</p>
            <ChipRow
              items={missing.map((name) => ({ required: name, kind: 'missing' as const }))}
              max={12}
              render={(skill, index) => <SkillChip key={index} skill={skill} />}
            />
          </div>
        )}
        {!matched.length && !missing.length && (
          <p className="text-sm text-muted-foreground">This role has no required skills listed.</p>
        )}
      </div>

      {explanation.evidence?.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence from the resume
            </h3>
            <ul className="space-y-2">
              {explanation.evidence.map((item, index) => (
                <li
                  key={index}
                  className="rounded-md border border-border bg-muted/40 p-2.5 text-xs"
                >
                  <span className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
                    <Quote className="size-3" aria-hidden="true" />
                    {item.skill}
                  </span>
                  <p className="text-muted-foreground">{item.snippet}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function radarSummary(data: { dimension: string; score: number }[]) {
  const parts = data.map((d) => `${d.dimension} ${d.score}%`).join(', ')
  return `Fit profile across five dimensions: ${parts}.`
}

/* -------------------------------------------------------------------------- */
/* Profile tab                                                                */
/* -------------------------------------------------------------------------- */
function ProfileTab({ match }: { match: MatchDetail }) {
  const candidate = match.candidate
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact label="Experience" value={`${candidate.total_experience.toFixed(0)} years`} />
        <Fact label="Education" value={candidate.highest_qualification ?? 'Not detected'} />
        <Fact label="Location" value={candidate.location ?? 'Not detected'} />
        <Fact label="University" value={candidate.university ?? 'Not detected'} />
        <Fact label="Source file" value={candidate.source_filename ?? '—'} />
        <Fact
          label="Verified"
          value={candidate.verified_by_candidate ? 'By candidate' : 'Auto-parsed only'}
        />
      </dl>

      {candidate.skills.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            All detected skills ({candidate.skills.length})
          </h3>
          <ChipRow
            items={candidate.skills}
            max={18}
            render={(skill: MatchDetail['candidate']['skills'][number], index) => (
              <Tooltip
                key={index}
                content={
                  skill.evidence
                    ? `${skill.proficiency} · ${pct(skill.confidence)} confidence — “${skill.evidence}”`
                    : `${skill.proficiency} · ${pct(skill.confidence)} confidence`
                }
              >
                <Badge variant="outline" className="cursor-help">
                  {skill.name}
                </Badge>
              </Tooltip>
            )}
          />
        </section>
      )}

      {candidate.experiences.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Work history
          </h3>
          <ul className="space-y-2">
            {candidate.experiences.map((item) => (
              <li key={item.id} className="flex gap-2.5 rounded-md border border-border p-2.5">
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold">{item.title ?? 'Role not detected'}</p>
                  <p className="text-muted-foreground">{item.company ?? 'Company not detected'}</p>
                  <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                    {item.start_date ?? '?'} – {item.end_date ?? 'Present'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {candidate.educations.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Education
          </h3>
          <ul className="space-y-2">
            {candidate.educations.map((item) => (
              <li key={item.id} className="flex gap-2.5 rounded-md border border-border p-2.5">
                <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold">{item.degree ?? 'Degree not detected'}</p>
                  <p className="text-muted-foreground">{item.institution ?? 'Institution hidden or not detected'}</p>
                  {item.graduation_year && (
                    <p className="tabular mt-0.5 text-[11px] text-muted-foreground">{item.graduation_year}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold" title={value}>
        {value}
      </dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Resume tab — text with matched terms highlighted                           */
/* -------------------------------------------------------------------------- */
function ResumeTab({ text, highlights }: { text: string; highlights: string[] }) {
  const html = React.useMemo(() => highlightTerms(text, highlights), [text, highlights])

  if (!text.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        No resume text is available for this candidate.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="size-3.5" aria-hidden="true" />
        Matched terms are highlighted.
      </div>
      <pre
        className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-sans text-xs leading-relaxed"
        // Content is escaped in highlightTerms before any markup is added.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function highlightTerms(text: string, terms: string[]) {
  const safe = escapeHtml(text)
  const unique = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!unique.length) return safe

  const pattern = new RegExp(`(${unique.map(escapeRegex).join('|')})`, 'gi')
  return safe.replace(
    pattern,
    '<mark class="rounded bg-primary/20 px-0.5 text-foreground">$1</mark>',
  )
}

/* -------------------------------------------------------------------------- */
/* Notes tab                                                                  */
/* -------------------------------------------------------------------------- */
function NotesTab({ matchId }: { matchId: number }) {
  const queryClient = useQueryClient()
  const [body, setBody] = React.useState('')
  const [rating, setRating] = React.useState<number | undefined>()

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', matchId],
    queryFn: () => api.matches.notes.list(matchId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notes', matchId] })
    queryClient.invalidateQueries({ queryKey: ['match', matchId] })
    queryClient.invalidateQueries({ queryKey: ['matches'] })
  }

  const addNote = useMutation({
    mutationFn: () => api.matches.notes.add(matchId, body.trim(), rating),
    onSuccess: () => {
      setBody('')
      setRating(undefined)
      invalidate()
      toast.success('Note added')
    },
    onError: (error: Error) => toast.error('Could not add note', { description: error.message }),
  })

  const removeNote = useMutation({
    mutationFn: (noteId: number) => api.matches.notes.remove(noteId),
    onSuccess: () => {
      invalidate()
      toast.success('Note deleted')
    },
    onError: (error: Error) => toast.error('Could not delete note', { description: error.message }),
  })

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (body.trim()) addNote.mutate()
        }}
        className="space-y-2"
      >
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What stood out? What should the next interviewer probe?"
          className="min-h-[76px] text-sm"
          aria-label="Note body"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StarRating value={rating} onChange={setRating} />
          <Button type="submit" size="sm" disabled={!body.trim()} loading={addNote.isPending}>
            <MessageSquarePlus aria-hidden="true" />
            Add note
          </Button>
        </div>
      </form>

      <Separator />

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No notes yet. Add the first one so the rest of the panel has context.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-border p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-semibold">{note.author_name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelative(note.created_at)}
                </span>
                {note.rating && (
                  <span className="flex items-center gap-0.5" aria-label={`${note.rating} out of 5`}>
                    {Array.from({ length: note.rating }).map((_, index) => (
                      <Star key={index} className="size-3 fill-accent text-accent" aria-hidden="true" />
                    ))}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() => removeNote.mutate(note.id)}
                  aria-label={`Delete note by ${note.author_name}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StarRating({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs text-muted-foreground">Rating</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(value === star ? undefined : star)}
          aria-label={`Rate ${star} out of 5`}
          aria-pressed={value === star}
          className="cursor-pointer rounded p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              'size-4',
              value && star <= value ? 'fill-accent text-accent' : 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}
