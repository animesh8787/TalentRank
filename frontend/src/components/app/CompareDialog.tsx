import { useQuery } from '@tanstack/react-query'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { CheckCircle2, Minus, XCircle } from 'lucide-react'

import { api } from '@/lib/api'
import { DIMENSION_META, cn, pct } from '@/lib/utils'
import {
  Badge,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@/components/ui/primitives'
import { Avatar, ScoreBadge } from '@/components/app/shared'

const SERIES_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--dim-education))']

export function CompareDialog({
  jobId,
  matchIds,
  open,
  onOpenChange,
}: {
  jobId: number
  matchIds: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['compare', jobId, matchIds],
    queryFn: () => api.matches.compare(jobId, matchIds),
    enabled: open && matchIds.length >= 2,
  })

  // Union of every required skill across the selected candidates.
  const allSkills = [
    ...new Set(
      matches.flatMap((match) => [
        ...(match.explanation?.matched_skills ?? []).map((skill) => skill.required),
        ...(match.explanation?.missing_skills ?? []),
      ]),
    ),
  ].sort()

  const radarData = DIMENSION_META.map((meta) => {
    const row: Record<string, string | number> = { dimension: meta.label }
    matches.forEach((match, index) => {
      row[`c${index}`] = Math.round((match.explanation?.dimensions[meta.key]?.score ?? 0) * 100)
    })
    return row
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[92dvh]">
        <DialogHeader>
          <DialogTitle>Compare candidates</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Side by side across every scoring dimension and required skill.
          </p>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : matches.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select at least two candidates to compare.
            </p>
          ) : (
            <>
              {/* Headline cards */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(${matches.length}, minmax(0, 1fr))` }}
              >
                {matches.map((match, index) => (
                  <div
                    key={match.id}
                    className="rounded-md border-t-4 border border-border p-3"
                    style={{ borderTopColor: SERIES_COLORS[index] }}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={match.candidate.full_name}
                        size="sm"
                        anonymized={match.candidate.is_anonymized}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {match.candidate.full_name ?? 'Unnamed'}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {match.candidate.total_experience.toFixed(0)} yrs ·{' '}
                          {match.candidate.highest_qualification ?? '—'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <ScoreBadge score={match.overall_score} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Overlaid radar */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fit profile
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis
                        dataKey="dimension"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value) => {
                          const index = Number(String(value).replace('c', ''))
                          return matches[index]?.candidate.full_name ?? value
                        }}
                      />
                      {matches.map((_, index) => (
                        <Radar
                          key={index}
                          dataKey={`c${index}`}
                          stroke={SERIES_COLORS[index]}
                          fill={SERIES_COLORS[index]}
                          fillOpacity={0.14}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dimension table — the exact numbers the radar only suggests */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dimension scores
                </h3>
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th scope="col" className="py-2 pr-3 text-xs font-semibold text-muted-foreground">
                          Dimension
                        </th>
                        {matches.map((match) => (
                          <th
                            key={match.id}
                            scope="col"
                            className="px-3 py-2 text-xs font-semibold text-muted-foreground"
                          >
                            {match.candidate.full_name ?? 'Unnamed'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DIMENSION_META.map((meta) => {
                        const values = matches.map(
                          (match) => match.explanation?.dimensions[meta.key]?.score ?? 0,
                        )
                        const best = Math.max(...values)
                        return (
                          <tr key={meta.key} className="border-b border-border last:border-0">
                            <th
                              scope="row"
                              className="py-2 pr-3 text-left text-xs font-medium"
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="size-2 rounded-sm"
                                  style={{ backgroundColor: meta.color }}
                                  aria-hidden="true"
                                />
                                {meta.label}
                              </span>
                            </th>
                            {values.map((value, index) => (
                              <td key={index} className="px-3 py-2">
                                <span
                                  className={cn(
                                    'tabular text-sm',
                                    value === best && best > 0
                                      ? 'font-bold text-success'
                                      : 'text-foreground',
                                  )}
                                >
                                  {pct(value)}
                                  {value === best && best > 0 && (
                                    <span className="ml-1 text-[10px] font-medium">best</span>
                                  )}
                                </span>
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Skill matrix */}
              {allSkills.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Required skills
                  </h3>
                  <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th scope="col" className="py-2 pr-3 text-xs font-semibold text-muted-foreground">
                            Skill
                          </th>
                          {matches.map((match) => (
                            <th
                              key={match.id}
                              scope="col"
                              className="px-3 py-2 text-xs font-semibold text-muted-foreground"
                            >
                              {match.candidate.full_name ?? 'Unnamed'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allSkills.map((skill) => (
                          <tr key={skill} className="border-b border-border last:border-0">
                            <th scope="row" className="py-1.5 pr-3 text-left text-xs font-medium">
                              {skill}
                            </th>
                            {matches.map((match) => {
                              const hit = match.explanation?.matched_skills.find(
                                (item) => item.required === skill,
                              )
                              return (
                                <td key={match.id} className="px-3 py-1.5">
                                  {hit ? (
                                    <span
                                      className={cn(
                                        'inline-flex items-center gap-1 text-xs font-medium',
                                        hit.kind === 'semantic' ? 'text-accent' : 'text-success',
                                      )}
                                    >
                                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                      {hit.kind === 'semantic' ? 'Similar' : 'Yes'}
                                    </span>
                                  ) : match.explanation?.missing_skills.includes(skill) ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                                      <XCircle className="size-3.5" aria-hidden="true" />
                                      No
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <Minus className="size-3.5" aria-hidden="true" />
                                      n/a
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
