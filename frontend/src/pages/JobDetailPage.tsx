import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowUpDown,
  Columns3,
  Download,
  GitCompare,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Table2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { api, downloadFile } from '@/lib/api'
import { STAGE_META, STAGE_ORDER, cn, pct } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@/components/ui/primitives'
import {
  Avatar,
  ChipRow,
  HealthPill,
  PageBody,
  PageHeader,
  ScoreBadge,
  TableSkeleton,
} from '@/components/app/shared'
import { WeightSliders } from '@/components/app/WeightSliders'
import { CandidateDrawer } from '@/components/app/CandidateDrawer'
import { KanbanBoard } from '@/components/app/KanbanBoard'
import { CompareDialog } from '@/components/app/CompareDialog'
import type { JobWeights, Match, PipelineStage, WeightPreviewRow } from '@/types'

type SortKey = 'overall' | 'skills' | 'experience' | 'education' | 'semantic' | 'name'

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const id = Number(jobId)
  const queryClient = useQueryClient()

  const [search, setSearch] = React.useState('')
  const [stageFilter, setStageFilter] = React.useState<string>('all')
  const [minScore, setMinScore] = React.useState(0)
  const [sortKey, setSortKey] = React.useState<SortKey>('overall')
  const [openMatchId, setOpenMatchId] = React.useState<number | null>(null)
  const [selected, setSelected] = React.useState<number[]>([])
  const [comparing, setComparing] = React.useState(false)
  const [showWeights, setShowWeights] = React.useState(false)
  const [draftWeights, setDraftWeights] = React.useState<JobWeights | null>(null)

  const { data: job, isLoading: loadingJob } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.jobs.get(id),
    enabled: Number.isFinite(id),
  })

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['matches', id, stageFilter, minScore],
    queryFn: () =>
      api.matches.list(id, {
        stage: stageFilter === 'all' ? undefined : (stageFilter as PipelineStage),
        min_score: minScore,
      }),
    enabled: Number.isFinite(id),
  })

  // Live re-ranking preview while the sliders move — never written to the DB.
  const { data: preview } = useQuery({
    queryKey: ['preview', id, draftWeights],
    queryFn: () => api.matches.previewWeights(id, draftWeights as JobWeights),
    enabled: !!draftWeights && Number.isFinite(id),
  })

  const saveWeights = useMutation({
    mutationFn: (weights: JobWeights) => api.jobs.update(id, { weights }),
    onSuccess: () => {
      toast.success('Weights saved', { description: 'Every candidate was re-scored.' })
      setDraftWeights(null)
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error: Error) => toast.error('Could not save weights', { description: error.message }),
  })

  const rescore = useMutation({
    mutationFn: () => api.jobs.rescore(id),
    onSuccess: (updated) => {
      toast.success('Re-scored', { description: `${updated.candidate_count} candidates evaluated.` })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['job', id] })
    },
    onError: (error: Error) => toast.error('Re-score failed', { description: error.message }),
  })

  // Apply the preview ordering on top of the fetched matches.
  const previewById = React.useMemo(() => {
    const map = new Map<number, WeightPreviewRow>()
    preview?.forEach((row) => map.set(row.match_id, row))
    return map
  }, [preview])

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = needle
      ? matches.filter((match) => {
          const candidate = match.candidate
          return (
            (candidate.full_name ?? '').toLowerCase().includes(needle) ||
            (candidate.email ?? '').toLowerCase().includes(needle) ||
            candidate.skills.some((skill) => skill.name.includes(needle))
          )
        })
      : matches

    const scoreOf = (match: Match) =>
      previewById.get(match.id)?.overall_score ?? match.overall_score

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return (a.candidate.full_name ?? '').localeCompare(b.candidate.full_name ?? '')
        case 'skills':
          return b.skills_score - a.skills_score
        case 'experience':
          return b.experience_score - a.experience_score
        case 'education':
          return b.education_score - a.education_score
        case 'semantic':
          return b.semantic_score - a.semantic_score
        default:
          return scoreOf(b) - scoreOf(a)
      }
    })

    return sorted.map((match, index) => ({
      match,
      displayRank: index + 1,
      displayScore: scoreOf(match),
      previewDelta: previewById.size
        ? (previewById.get(match.id)?.rank ?? index + 1) - match.rank
        : 0,
    }))
  }, [matches, search, sortKey, previewById])

  async function handleExport() {
    if (!job) return
    try {
      await downloadFile(
        api.matches.exportUrl(id, stageFilter === 'all' ? undefined : (stageFilter as PipelineStage)),
        `${job.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-shortlist.csv`,
      )
      toast.success('Shortlist exported')
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  if (loadingJob) {
    return (
      <PageBody>
        <Skeleton className="h-20 w-full" />
        <TableSkeleton rows={8} />
      </PageBody>
    )
  }

  if (!job) {
    return (
      <PageBody>
        <EmptyState
          title="Role not found"
          description="It may have been deleted."
          action={
            <Button asChild size="sm">
              <Link to="/jobs">Back to roles</Link>
            </Button>
          }
        />
      </PageBody>
    )
  }

  return (
    <>
      <PageHeader
        title={job.title}
        description={[
          job.department,
          job.remote_ok ? 'Remote OK' : job.location,
          `${job.required_experience.toFixed(0)}+ yrs`,
          job.required_education,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/jobs">
                <ArrowLeft aria-hidden="true" />
                Roles
              </Link>
            </Button>
            <Tooltip content="Recompute every score from scratch">
              <Button
                variant="outline"
                size="sm"
                onClick={() => rescore.mutate()}
                loading={rescore.isPending}
              >
                <RefreshCw aria-hidden="true" />
                Re-score
              </Button>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download aria-hidden="true" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant={showWeights ? 'default' : 'outline'}
              onClick={() => {
                setShowWeights((open) => !open)
                if (!showWeights && !draftWeights) setDraftWeights(job.weights)
              }}
              aria-expanded={showWeights}
            >
              <SlidersHorizontal aria-hidden="true" />
              Tune weights
            </Button>
          </>
        }
      >
        {/* Required skills strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2.5 sm:px-6">
          <span className="text-xs font-semibold text-muted-foreground">Required:</span>
          <ChipRow
            items={job.required_skills}
            max={10}
            render={(skill: string) => (
              <Badge key={skill} variant="secondary" className="font-normal">
                {skill}
              </Badge>
            )}
          />
        </div>
      </PageHeader>

      {showWeights && (
        <div className="animate-fade-up border-b border-border bg-muted/40 px-4 py-4 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
            <Card className="p-4">
              <h2 className="mb-1 text-sm font-bold">Scoring weights</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Move a slider to preview the new ranking instantly. Nothing is saved until you
                apply.
              </p>
              <WeightSliders
                value={draftWeights ?? job.weights}
                onChange={setDraftWeights}
                compact
              />
              <Separator className="my-3" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!draftWeights}
                  loading={saveWeights.isPending}
                  onClick={() => draftWeights && saveWeights.mutate(draftWeights)}
                >
                  Apply to this role
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraftWeights(job.weights)}
                  disabled={!draftWeights}
                >
                  Revert
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 text-sm font-bold">Ranking preview</h2>
              {!preview?.length ? (
                <p className="text-xs text-muted-foreground">
                  Adjust a slider to see how the order would change.
                </p>
              ) : (
                <ol className="grid gap-1.5 sm:grid-cols-2">
                  {rows.slice(0, 8).map(({ match, displayRank, displayScore, previewDelta }) => (
                    <li
                      key={match.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                    >
                      <span className="tabular w-5 shrink-0 font-bold text-muted-foreground">
                        {displayRank}
                      </span>
                      <span className="truncate font-medium">
                        {match.candidate.full_name ?? 'Unnamed'}
                      </span>
                      <span className="tabular ml-auto shrink-0 font-semibold">
                        {pct(displayScore)}
                      </span>
                      {previewDelta !== 0 && (
                        <span
                          className={cn(
                            'tabular shrink-0 text-[10px] font-bold',
                            previewDelta < 0 ? 'text-success' : 'text-destructive',
                          )}
                          aria-label={
                            previewDelta < 0
                              ? `up ${Math.abs(previewDelta)} places`
                              : `down ${previewDelta} places`
                          }
                        >
                          {previewDelta < 0 ? '▲' : '▼'}
                          {Math.abs(previewDelta)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}

      <Tabs defaultValue="ranking">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2.5 sm:px-6">
          <TabsList>
            <TabsTrigger value="ranking">
              <Table2 className="size-3.5" aria-hidden="true" />
              Ranking
            </TabsTrigger>
            <TabsTrigger value="pipeline">
              <Columns3 className="size-3.5" aria-hidden="true" />
              Pipeline
            </TabsTrigger>
          </TabsList>

          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by name, email or skill…"
              className="h-8 pl-8"
              aria-label="Filter candidates"
            />
          </div>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_ORDER.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_META[stage].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(minScore)} onValueChange={(value) => setMinScore(Number(value))}>
            <SelectTrigger className="h-8 w-32 text-xs" aria-label="Minimum score">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any score</SelectItem>
              <SelectItem value="0.4">40%+</SelectItem>
              <SelectItem value="0.6">60%+</SelectItem>
              <SelectItem value="0.8">80%+</SelectItem>
            </SelectContent>
          </Select>

          {selected.length >= 2 && (
            <Button size="sm" onClick={() => setComparing(true)}>
              <GitCompare aria-hidden="true" />
              Compare {selected.length}
            </Button>
          )}

          <span className="tabular ml-auto text-xs text-muted-foreground">
            {rows.length} candidate{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <TabsContent value="ranking" className="focus:outline-none">
          <PageBody>
            {loadingMatches ? (
              <TableSkeleton rows={8} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title={
                  matches.length === 0
                    ? 'No candidates scored yet'
                    : `Nothing matches your filters`
                }
                description={
                  matches.length === 0
                    ? 'Upload resumes and they will be scored against this role automatically.'
                    : 'Try widening the score threshold or clearing the search.'
                }
                action={
                  matches.length === 0 ? (
                    <Button asChild size="sm">
                      <Link to="/upload">Upload resumes</Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setStageFilter('all')
                        setMinScore(0)
                      }}
                    >
                      Clear filters
                    </Button>
                  )
                }
              />
            ) : (
              <RankingTable
                rows={rows}
                sortKey={sortKey}
                onSort={setSortKey}
                selected={selected}
                onSelect={setSelected}
                onOpen={setOpenMatchId}
                previewing={previewById.size > 0}
              />
            )}
          </PageBody>
        </TabsContent>

        <TabsContent value="pipeline" className="focus:outline-none">
          <PageBody>
            <KanbanBoard
              matches={rows.map((row) => row.match)}
              loading={loadingMatches}
              onOpen={setOpenMatchId}
            />
          </PageBody>
        </TabsContent>
      </Tabs>

      <CandidateDrawer matchId={openMatchId} onOpenChange={(open) => !open && setOpenMatchId(null)} />
      <CompareDialog
        jobId={id}
        matchIds={selected}
        open={comparing}
        onOpenChange={(open) => {
          setComparing(open)
          if (!open) setSelected([])
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Ranking table                                                              */
/* -------------------------------------------------------------------------- */
interface Row {
  match: Match
  displayRank: number
  displayScore: number
  previewDelta: number
}

function RankingTable({
  rows,
  sortKey,
  onSort,
  selected,
  onSelect,
  onOpen,
  previewing,
}: {
  rows: Row[]
  sortKey: SortKey
  onSort: (key: SortKey) => void
  selected: number[]
  onSelect: (next: number[]) => void
  onOpen: (matchId: number) => void
  previewing: boolean
}) {
  const toggle = (matchId: number) =>
    onSelect(
      selected.includes(matchId)
        ? selected.filter((id) => id !== matchId)
        : selected.length >= 3
          ? selected
          : [...selected, matchId],
    )

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: 'skills', label: 'Skills' },
    { key: 'experience', label: 'Exp' },
    { key: 'education', label: 'Edu' },
    { key: 'semantic', label: 'Rel' },
  ]

  return (
    <Card className="overflow-hidden">
      {/* Wide content scrolls inside its own container; the page never does. */}
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <caption className="sr-only">
            Candidates ranked against this role, with per-dimension scores.
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Select for comparison</span>
              </th>
              <th scope="col" className="w-12 px-2 py-2 text-xs font-semibold text-muted-foreground">
                #
              </th>
              <SortableHeader
                label="Candidate"
                sortKey="name"
                active={sortKey}
                onSort={onSort}
                className="min-w-[220px]"
              />
              <SortableHeader
                label="Overall"
                sortKey="overall"
                active={sortKey}
                onSort={onSort}
                className="w-32"
              />
              {columns.map((column) => (
                <SortableHeader
                  key={column.key}
                  label={column.label}
                  sortKey={column.key}
                  active={sortKey}
                  onSort={onSort}
                  className="w-20"
                />
              ))}
              <th scope="col" className="w-32 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Stage
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ match, displayRank, displayScore, previewDelta }) => {
              const candidate = match.candidate
              const stage = STAGE_META[match.stage]
              const isSelected = selected.includes(match.id)
              return (
                <tr
                  key={match.id}
                  className={cn(
                    'cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50',
                    isSelected && 'bg-primary/5',
                  )}
                  onClick={() => onOpen(match.id)}
                >
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(match.id)}
                      disabled={!isSelected && selected.length >= 3}
                      aria-label={`Select ${candidate.full_name ?? 'candidate'} for comparison`}
                    />
                  </td>
                  <td className="tabular px-2 py-2 text-xs font-bold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {displayRank}
                      {previewing && previewDelta !== 0 && (
                        <span
                          className={cn(
                            'text-[9px]',
                            previewDelta < 0 ? 'text-success' : 'text-destructive',
                          )}
                          aria-label={
                            previewDelta < 0
                              ? `up ${Math.abs(previewDelta)}`
                              : `down ${previewDelta}`
                          }
                        >
                          {previewDelta < 0 ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={candidate.full_name}
                        size="sm"
                        anonymized={candidate.is_anonymized}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-tight">
                          {candidate.full_name ?? 'Unnamed'}
                        </p>
                        <p className="truncate text-xs leading-tight text-muted-foreground">
                          {candidate.headline ??
                            candidate.email ??
                            `${candidate.total_experience.toFixed(0)} yrs experience`}
                        </p>
                      </div>
                      <HealthPill score={candidate.health_score} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBadge score={displayScore} size="sm" />
                  </td>
                  <MiniScore value={match.skills_score} dimension="skills" />
                  <MiniScore value={match.experience_score} dimension="experience" />
                  <MiniScore value={match.education_score} dimension="education" />
                  <MiniScore value={match.semantic_score} dimension="semantic" />
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn('gap-1.5', stage.className)}>
                      <span className={cn('size-1.5 rounded-full', stage.dot)} aria-hidden="true" />
                      {stage.label}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SortableHeader({
  label,
  sortKey,
  active,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  onSort: (key: SortKey) => void
  className?: string
}) {
  const isActive = active === sortKey
  return (
    <th
      scope="col"
      aria-sort={isActive ? 'descending' : 'none'}
      className={cn('px-3 py-2 text-xs font-semibold text-muted-foreground', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'text-foreground',
        )}
      >
        {label}
        <ArrowUpDown className="size-3" aria-hidden="true" />
      </button>
    </th>
  )
}

function MiniScore({ value, dimension }: { value: number; dimension: string }) {
  return (
    <td className="px-3 py-2">
      <div className="space-y-1">
        <span className="tabular text-xs font-medium">{pct(value)}</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, value * 100)}%`,
              backgroundColor: `hsl(var(--dim-${dimension}))`,
            }}
          />
        </div>
      </div>
    </td>
  )
}
