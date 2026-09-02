import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Briefcase,
  FileCheck2,
  Gauge,
  Plus,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'

import { api } from '@/lib/api'
import { STAGE_META, cn, formatRelative, pct } from '@/lib/utils'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@/components/ui/primitives'
import { PageBody, PageHeader, ScoreBadge, StatCard } from '@/components/app/shared'

export function DashboardPage() {
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.analytics.get(),
  })

  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list(),
  })

  const { data: audit = [] } = useQuery({
    queryKey: ['audit', 'dashboard'],
    queryFn: () => api.analytics.audit(8),
  })

  const activeJobs = jobs.filter((job) => job.status === 'active')

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where hiring stands right now across every open role."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/upload">
                <Upload aria-hidden="true" />
                Upload resumes
              </Link>
            </Button>
            <Button asChild>
              <Link to="/jobs?new=1">
                <Plus aria-hidden="true" />
                New role
              </Link>
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Candidates"
            value={analytics?.total_candidates ?? 0}
            hint={`${analytics?.processed_today ?? 0} added in the last 24h`}
            icon={Users}
            tone="primary"
            loading={loadingAnalytics}
          />
          <StatCard
            label="Open roles"
            value={activeJobs.length}
            hint={`${jobs.length} total`}
            icon={Briefcase}
            tone="accent"
            loading={loadingJobs}
          />
          <StatCard
            label="Average fit"
            value={analytics ? pct(analytics.average_score) : '—'}
            hint="Across every scored pairing"
            icon={Gauge}
            tone="success"
            loading={loadingAnalytics}
          />
          <StatCard
            label="Parse success"
            value={analytics ? `${analytics.upload_success_rate}%` : '—'}
            hint="Resumes read without errors"
            icon={FileCheck2}
            tone={analytics && analytics.upload_success_rate < 90 ? 'warning' : 'success'}
            loading={loadingAnalytics}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Roles */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Open roles</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/jobs">
                  View all
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingJobs ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-[68px] w-full" />
                ))
              ) : activeJobs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No open roles yet"
                  description="Create a role and every resume on file is scored against it automatically."
                  action={
                    <Button asChild size="sm">
                      <Link to="/jobs?new=1">
                        <Plus aria-hidden="true" />
                        Create a role
                      </Link>
                    </Button>
                  }
                />
              ) : (
                activeJobs.slice(0, 5).map((job) => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{job.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.department ?? 'No department'} · {job.location ?? 'Any location'}
                        {job.remote_ok && ' · Remote OK'}
                      </p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
                      <div>
                        <p className="tabular text-sm font-semibold">{job.candidate_count}</p>
                        <p className="text-[11px] text-muted-foreground">scored</p>
                      </div>
                      <div>
                        <p className="tabular text-sm font-semibold text-primary">
                          {job.shortlisted_count}
                        </p>
                        <p className="text-[11px] text-muted-foreground">in pipeline</p>
                      </div>
                    </div>
                    <ScoreBadge score={job.average_score} size="sm" showLabel={false} />
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pipeline snapshot */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingAnalytics ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))
              ) : (
                analytics?.pipeline_funnel.map((row) => {
                  const meta = STAGE_META[row.stage]
                  const total = analytics.total_matches || 1
                  return (
                    <div key={row.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className={cn('size-2 rounded-full', meta?.dot)} aria-hidden="true" />
                          {meta?.label ?? row.label}
                        </span>
                        <span className="tabular font-semibold">{row.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', meta?.dot ?? 'bg-primary')}
                          style={{ width: `${Math.max(1, (row.count / total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Hardest skills to find */}
          <Card>
            <CardHeader>
              <CardTitle>Hardest skills to source</CardTitle>
              <p className="text-xs text-muted-foreground">
                Required by your roles, but rare in the candidate pool.
              </p>
            </CardHeader>
            <CardContent>
              {loadingAnalytics ? (
                <Skeleton className="h-40 w-full" />
              ) : !analytics?.skill_gaps.length ? (
                <EmptyState
                  icon={Sparkles}
                  title="Nothing to compare yet"
                  description="Add a role with required skills to see where your pool is thin."
                />
              ) : (
                <ul className="space-y-2">
                  {analytics.skill_gaps.slice(0, 6).map((gap) => (
                    <li key={gap.skill} className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-medium">{gap.skill}</span>
                        <span className="tabular text-muted-foreground">
                          {gap.supply} of {analytics.total_candidates} ({gap.supply_pct}%)
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

          {/* Recent activity */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent activity</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/activity">
                  View all
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <EmptyState title="No activity recorded yet" />
              ) : (
                <ul className="space-y-2.5">
                  {audit.map((event) => (
                    <li key={event.id} className="flex items-start gap-2.5 text-xs">
                      <Badge variant="muted" className="shrink-0 font-mono text-[10px]">
                        {event.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{event.summary}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {event.actor_name} · {formatRelative(event.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  )
}
