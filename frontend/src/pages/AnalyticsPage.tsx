import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, FileCheck2, Gauge, TrendingDown, Users } from 'lucide-react'

import { api } from '@/lib/api'
import { STAGE_META, cn, pct } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@/components/ui/primitives'
import { PageBody, PageHeader, StatCard } from '@/components/app/shared'

export function AnalyticsPage() {
  const [jobFilter, setJobFilter] = React.useState('all')

  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => api.jobs.list() })

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', jobFilter],
    queryFn: () => api.analytics.get(jobFilter === 'all' ? undefined : Number(jobFilter)),
  })

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How the pipeline is performing and where the candidate pool is thin."
        actions={
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-56" aria-label="Scope analytics to a role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={String(job.id)}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Candidates"
            value={data?.total_candidates ?? 0}
            icon={Users}
            tone="primary"
            loading={isLoading}
          />
          <StatCard
            label="Scored pairings"
            value={data?.total_matches ?? 0}
            hint={jobFilter === 'all' ? 'Across every role' : 'For this role'}
            icon={BarChart3}
            tone="accent"
            loading={isLoading}
          />
          <StatCard
            label="Average fit"
            value={data ? pct(data.average_score) : '—'}
            icon={Gauge}
            tone="success"
            loading={isLoading}
          />
          <StatCard
            label="Parse success"
            value={data ? `${data.upload_success_rate}%` : '—'}
            hint="Resumes read without errors"
            icon={FileCheck2}
            tone={data && data.upload_success_rate < 90 ? 'warning' : 'success'}
            loading={isLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Fit score distribution"
            description="How many candidates fall in each score band."
            loading={isLoading}
            empty={!data?.score_distribution.some((row) => row.count > 0)}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.score_distribution ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="band"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<ChartTooltip suffix="candidates" />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {(data?.score_distribution ?? []).map((row, index) => (
                    <Cell
                      key={row.band}
                      fill={
                        index >= 4
                          ? 'hsl(var(--success))'
                          : index === 3
                            ? 'hsl(var(--primary))'
                            : index === 2
                              ? 'hsl(var(--warning))'
                              : 'hsl(var(--muted-foreground))'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <DataTable
              caption="Fit score distribution"
              head={['Band', 'Candidates']}
              rows={(data?.score_distribution ?? []).map((row) => [row.band, String(row.count)])}
            />
          </ChartCard>

          <ChartCard
            title="Experience spread"
            description="Seniority mix across the whole candidate pool."
            loading={isLoading}
            empty={!data?.experience_distribution.some((row) => row.count > 0)}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data?.experience_distribution ?? []}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 0, left: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="band"
                  width={64}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<ChartTooltip suffix="candidates" />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="count" fill="hsl(var(--dim-experience))" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <DataTable
              caption="Experience spread"
              head={['Band', 'Candidates']}
              rows={(data?.experience_distribution ?? []).map((row) => [row.band, String(row.count)])}
            />
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <TrendingDown className="size-4 text-destructive" aria-hidden="true" />
                Skill supply gap
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Skills your roles require, ranked by how few candidates have them.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : !data?.skill_gaps.length ? (
                <EmptyState title="No required skills recorded" description="Add skills to a role to see the gap." />
              ) : (
                <ul className="space-y-2.5">
                  {data.skill_gaps.map((gap) => (
                    <li key={gap.skill} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{gap.skill}</span>
                        <span className="tabular shrink-0 text-muted-foreground">
                          {gap.supply}/{data.total_candidates} ({gap.supply_pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            gap.supply_pct < 15
                              ? 'bg-destructive'
                              : gap.supply_pct < 40
                                ? 'bg-warning'
                                : 'bg-success',
                          )}
                          style={{ width: `${Math.max(2, gap.supply_pct)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Most common skills</CardTitle>
              <p className="text-xs text-muted-foreground">
                What the candidate pool actually has, regardless of what roles need.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : !data?.top_skills.length ? (
                <EmptyState title="No skills recorded yet" />
              ) : (
                <ul className="space-y-2">
                  {data.top_skills.slice(0, 10).map((row) => {
                    const max = data.top_skills[0]?.count || 1
                    return (
                      <li key={row.skill} className="flex items-center gap-2 text-xs">
                        <span className="w-28 shrink-0 truncate font-medium">{row.skill}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full rounded bg-primary/70"
                            style={{ width: `${(row.count / max) * 100}%` }}
                          />
                        </div>
                        <span className="tabular w-8 shrink-0 text-right font-semibold">
                          {row.count}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
            <p className="text-xs text-muted-foreground">
              Where candidates currently sit{jobFilter === 'all' ? ' across all roles' : ' for this role'}.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {data?.pipeline_funnel.map((row) => {
                  const meta = STAGE_META[row.stage]
                  return (
                    <div key={row.stage} className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('size-2 rounded-full', meta?.dot)} aria-hidden="true" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {meta?.label ?? row.label}
                        </span>
                      </div>
                      <p className="tabular mt-1 text-2xl font-bold leading-none">{row.count}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

function ChartCard({
  title,
  description,
  loading,
  empty,
  children,
}: {
  title: string
  description: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-60 w-full" />
        ) : empty ? (
          <EmptyState title="No data yet" description="Numbers appear once resumes have been scored." />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  suffix: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-pop">
      <p className="font-semibold">{label}</p>
      <p className="tabular text-muted-foreground">
        {payload[0].value} {suffix}
      </p>
    </div>
  )
}

/** Screen-reader and keyboard accessible alternative to each chart. */
function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: string[][]
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        View as table
      </summary>
      <div className="scrollbar-thin mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              {head.map((cell) => (
                <th key={cell} scope="col" className="py-1.5 pr-3 font-semibold text-muted-foreground">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cn('py-1.5 pr-3', cellIndex > 0 && 'tabular')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
