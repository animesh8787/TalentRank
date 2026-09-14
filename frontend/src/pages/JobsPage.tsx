import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Briefcase, MapPin, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { formatSalary, pct } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
} from '@/components/ui/primitives'
import { PageBody, PageHeader, ScoreBadge } from '@/components/app/shared'
import { JobForm } from '@/components/app/JobForm'
import type { Job } from '@/types'

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [editing, setEditing] = React.useState<Job | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<Job | null>(null)
  const queryClient = useQueryClient()

  const creating = searchParams.get('new') === '1'
  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(searchParams)
    if (open) next.set('new', '1')
    else next.delete('new')
    setSearchParams(next, { replace: true })
  }

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', statusFilter],
    queryFn: () => api.jobs.list(statusFilter === 'all' ? {} : { status_filter: statusFilter }),
  })

  const removeJob = useMutation({
    mutationFn: (id: number) => api.jobs.remove(id),
    onSuccess: () => {
      toast.success('Role deleted')
      setConfirmDelete(null)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error: Error) => toast.error('Could not delete role', { description: error.message }),
  })

  const visible = jobs.filter((job) =>
    search.trim()
      ? `${job.title} ${job.department ?? ''} ${job.required_skills.join(' ')}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      : true,
  )

  return (
    <>
      <PageHeader
        title="Roles"
        description="Every open position and how the candidate pool measures up."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New role
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 sm:px-6">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search roles or skills…"
              className="pl-8"
              aria-label="Search roles"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <span className="tabular ml-auto text-xs text-muted-foreground">
            {visible.length} role{visible.length === 1 ? '' : 's'}
          </span>
        </div>
      </PageHeader>

      <PageBody>
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-44 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={search ? `No roles match “${search}”` : 'No roles yet'}
            description={
              search
                ? 'Try a different search term, or clear the filter.'
                : 'Create your first role — every resume on file gets scored against it immediately.'
            }
            action={
              search ? (
                <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" />
                  Create a role
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onEdit={() => setEditing(job)}
                onDelete={() => setConfirmDelete(job)}
              />
            ))}
          </div>
        )}
      </PageBody>

      {/* Create / edit */}
      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent wide className="max-h-[92dvh]">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.title}` : 'New role'}</DialogTitle>
          </DialogHeader>
          <JobForm
            job={editing}
            onDone={() => {
              setCreating(false)
              setEditing(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.title}”?</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-sm text-muted-foreground">
            This removes the role and all {confirmDelete?.candidate_count ?? 0} of its match records,
            including pipeline stages and notes. Candidate profiles and resumes are not affected.
            This cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeJob.isPending}
              onClick={() => confirmDelete && removeJob.mutate(confirmDelete.id)}
            >
              <Trash2 aria-hidden="true" />
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function JobCard({
  job,
  onEdit,
  onDelete,
}: {
  job: Job
  onEdit: () => void
  onDelete: () => void
}) {
  const salary = formatSalary(job.salary_min, job.salary_max)

  return (
    <Card className="flex flex-col transition-colors hover:border-primary/40">
      <div className="flex items-start gap-2 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-bold tracking-tight">{job.title}</h2>
            <Badge
              variant={job.status === 'active' ? 'success' : job.status === 'draft' ? 'muted' : 'outline'}
              className="shrink-0 capitalize"
            >
              {job.status}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {job.department ?? 'No department'}
          </p>
        </div>
        <ScoreBadge score={job.average_score} size="sm" showLabel={false} />
      </div>

      <div className="flex-1 space-y-3 px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {job.remote_ok ? 'Remote OK' : (job.location ?? 'Any location')}
          </span>
          <span className="tabular">{job.required_experience.toFixed(0)}+ yrs</span>
          {job.required_education && <span>{job.required_education}</span>}
          {salary && <span className="tabular">{salary}</span>}
        </div>

        <div className="flex flex-wrap gap-1">
          {job.required_skills.slice(0, 5).map((skill) => (
            <Badge key={skill} variant="secondary" className="font-normal">
              {skill}
            </Badge>
          ))}
          {job.required_skills.length > 5 && (
            <Badge variant="muted" className="font-normal">
              +{job.required_skills.length - 5}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border p-3">
        <Tooltip content="Candidates scored against this role">
          <span className="flex cursor-help items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />
            <span className="tabular font-semibold text-foreground">{job.candidate_count}</span>
          </span>
        </Tooltip>
        <Tooltip content="Moved past the New stage">
          <span className="cursor-help text-xs text-muted-foreground">
            <span className="tabular font-semibold text-primary">{job.shortlisted_count}</span> in
            pipeline
          </span>
        </Tooltip>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Tooltip content="Delete role">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${job.title}`}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </Tooltip>
          <Button size="sm" asChild>
            <Link to={`/jobs/${job.id}`}>
              Rank
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}
