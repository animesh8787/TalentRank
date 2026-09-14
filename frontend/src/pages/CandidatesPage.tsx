import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Filter, Search, SlidersHorizontal, Users, X } from 'lucide-react'

import { api } from '@/lib/api'
import { cn, formatRelative } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Tooltip,
} from '@/components/ui/primitives'
import {
  Avatar,
  ChipRow,
  HealthPill,
  PageBody,
  PageHeader,
  TableSkeleton,
} from '@/components/app/shared'
import { CandidateProfileDialog } from '@/components/app/CandidateProfileDialog'
import type { Candidate } from '@/types'

export function CandidatesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [skills, setSkills] = React.useState<string[]>([])
  const [education, setEducation] = React.useState('all')
  const [location, setLocation] = React.useState('all')
  const [minExperience, setMinExperience] = React.useState(0)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  const focusId = searchParams.get('focus')
  const setFocus = (id: number | null) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('focus', String(id))
    else next.delete('focus')
    setSearchParams(next, { replace: true })
  }

  // Debounce so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const { data: options } = useQuery({
    queryKey: ['candidate-filters'],
    queryFn: api.candidates.filters,
    staleTime: 120_000,
  })

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['candidates', debounced, skills, education, location, minExperience],
    queryFn: () =>
      api.candidates.list({
        search: debounced || undefined,
        skills: skills.length ? skills.join(',') : undefined,
        education: education === 'all' ? undefined : education,
        location: location === 'all' ? undefined : location,
        min_experience: minExperience || undefined,
        limit: 300,
      }),
  })

  const activeFilters =
    skills.length + (education !== 'all' ? 1 : 0) + (location !== 'all' ? 1 : 0) + (minExperience ? 1 : 0)

  const clearAll = () => {
    setSkills([])
    setEducation('all')
    setLocation('all')
    setMinExperience(0)
  }

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Everyone whose resume has been parsed, across all roles."
        actions={
          <Button
            variant={activeFilters ? 'default' : 'outline'}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="tabular ml-0.5 rounded bg-primary-foreground/20 px-1.5 text-xs">
                {activeFilters}
              </span>
            )}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 sm:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search names, emails or resume text…"
              className="pl-8"
              aria-label="Search candidates"
            />
          </div>

          {activeFilters > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                  {skill}
                  <button
                    type="button"
                    onClick={() => setSkills(skills.filter((item) => item !== skill))}
                    className="cursor-pointer rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${skill} filter`}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
              {education !== 'all' && <Badge variant="secondary">{education}</Badge>}
              {location !== 'all' && <Badge variant="secondary">{location}</Badge>}
              {minExperience > 0 && <Badge variant="secondary">{minExperience}+ yrs</Badge>}
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            </div>
          )}

          <span className="tabular ml-auto text-xs text-muted-foreground">
            {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
          </span>
        </div>
      </PageHeader>

      <PageBody>
        {isLoading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debounced || activeFilters ? 'No candidates match' : 'No candidates yet'}
            description={
              debounced || activeFilters
                ? 'Try removing a filter or searching for something broader.'
                : 'Upload resumes and they will appear here, fully parsed.'
            }
            action={
              debounced || activeFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    clearAll()
                  }}
                >
                  Reset search and filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onOpen={() => setFocus(candidate.id)}
              />
            ))}
          </div>
        )}
      </PageBody>

      {/* Filters */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter candidates</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold">Must have all these skills</p>
              <div className="scrollbar-thin max-h-52 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {options?.skills.length ? (
                  options.skills.map((skill) => (
                    <label
                      key={skill.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={skills.includes(skill.name)}
                        onCheckedChange={(checked) =>
                          setSkills(
                            checked
                              ? [...skills, skill.name]
                              : skills.filter((item) => item !== skill.name),
                          )
                        }
                      />
                      <span className="flex-1 truncate">{skill.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{skill.count}</span>
                    </label>
                  ))
                ) : (
                  <p className="p-2 text-xs text-muted-foreground">No skills recorded yet.</p>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="filter-education" className="text-xs font-semibold">
                  Education
                </label>
                <Select value={education} onValueChange={setEducation}>
                  <SelectTrigger id="filter-education">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {options?.educations.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="filter-location" className="text-xs font-semibold">
                  Location
                </label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger id="filter-location">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Anywhere</SelectItem>
                    {options?.locations.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="filter-experience" className="text-xs font-semibold">
                Minimum experience
              </label>
              <Select
                value={String(minExperience)}
                onValueChange={(value) => setMinExperience(Number(value))}
              >
                <SelectTrigger id="filter-experience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 5, 8, 10, 15].map((years) => (
                    <SelectItem key={years} value={String(years)}>
                      {years === 0 ? 'Any experience' : `${years}+ years`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <div className="flex justify-between gap-2 border-t border-border p-4">
            <Button variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              Show {candidates.length} result{candidates.length === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CandidateProfileDialog
        candidateId={focusId ? Number(focusId) : null}
        onOpenChange={(open) => !open && setFocus(null)}
      />
    </>
  )
}

function CandidateCard({
  candidate,
  onOpen,
}: {
  candidate: Candidate
  onOpen: () => void
}) {
  return (
    <Card className="flex flex-col p-3 transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex cursor-pointer items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={candidate.full_name} anonymized={candidate.is_anonymized} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{candidate.full_name ?? 'Unnamed'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {candidate.headline ?? candidate.email ?? 'No headline detected'}
          </p>
        </div>
        <HealthPill score={candidate.health_score} />
      </button>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular">{candidate.total_experience.toFixed(0)} yrs</span>
        {candidate.highest_qualification && <span>{candidate.highest_qualification}</span>}
        {candidate.location && <span>{candidate.location}</span>}
        {candidate.verified_by_candidate && (
          <Tooltip content="This candidate reviewed and confirmed their parsed details.">
            <Badge variant="success" className="cursor-help">
              Verified
            </Badge>
          </Tooltip>
        )}
      </div>

      <div className="mt-2.5 flex-1">
        <ChipRow
          items={candidate.skills.slice(0, 20)}
          max={6}
          render={(skill: Candidate['skills'][number]) => (
            <Badge key={skill.id} variant="outline" className="font-normal">
              {skill.name}
            </Badge>
          )}
        />
      </div>

      <p className="mt-2.5 text-[11px] text-muted-foreground">
        Added {formatRelative(candidate.created_at)}
      </p>
    </Card>
  )
}
