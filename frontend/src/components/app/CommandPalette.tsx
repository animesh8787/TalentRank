import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import {
  BarChart3,
  Briefcase,
  LayoutDashboard,
  Moon,
  ScrollText,
  Sun,
  Upload,
  UserCircle,
  Users,
} from 'lucide-react'

import { api } from '@/lib/api'
import { cn, initials, pct } from '@/lib/utils'
import { useAnonymized, useAuth, useTheme } from '@/hooks/providers'
import { Dialog, DialogContent } from '@/components/ui/primitives'

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { isStaff, user } = useAuth()
  const { setTheme } = useTheme()
  const { anonymized, setAnonymized } = useAnonymized()
  const [search, setSearch] = React.useState('')

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs', 'palette'],
    queryFn: () => api.jobs.list(),
    enabled: open && isStaff,
    staleTime: 30_000,
  })

  // Only query candidates once the user has typed something meaningful.
  const { data: candidates = [] } = useQuery({
    queryKey: ['candidates', 'palette', search],
    queryFn: () => api.candidates.list({ search, limit: 8 }),
    enabled: open && isStaff && search.trim().length >= 2,
    staleTime: 10_000,
  })

  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <Command
          label="Command palette"
          shouldFilter
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <div className="border-b border-border px-3">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search or run a command…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="scrollbar-thin max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              Nothing matched “{search}”.
            </Command.Empty>

            <Command.Group heading="Go to">
              {isStaff && (
                <>
                  <Item icon={LayoutDashboard} onSelect={() => go('/')}>
                    Dashboard
                  </Item>
                  <Item icon={Briefcase} onSelect={() => go('/jobs')}>
                    Roles
                  </Item>
                  <Item icon={Users} onSelect={() => go('/candidates')}>
                    Candidates
                  </Item>
                  <Item icon={BarChart3} onSelect={() => go('/analytics')}>
                    Analytics
                  </Item>
                  <Item icon={ScrollText} onSelect={() => go('/activity')}>
                    Activity log
                  </Item>
                </>
              )}
              <Item icon={Upload} onSelect={() => go('/upload')}>
                Upload resumes
              </Item>
              {user?.role === 'candidate' && (
                <Item icon={UserCircle} onSelect={() => go('/my-resume')}>
                  My resume
                </Item>
              )}
            </Command.Group>

            {isStaff && jobs.length > 0 && (
              <Command.Group heading="Roles">
                {jobs.map((job) => (
                  <Item
                    key={job.id}
                    icon={Briefcase}
                    value={`role ${job.title} ${job.department ?? ''}`}
                    onSelect={() => go(`/jobs/${job.id}`)}
                  >
                    <span className="truncate">{job.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {job.candidate_count} candidates
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}

            {isStaff && candidates.length > 0 && (
              <Command.Group heading="Candidates">
                {candidates.map((candidate) => (
                  <Item
                    key={candidate.id}
                    value={`candidate ${candidate.full_name} ${candidate.email ?? ''}`}
                    onSelect={() => go(`/candidates?focus=${candidate.id}`)}
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold"
                      aria-hidden="true"
                    >
                      {initials(candidate.full_name)}
                    </span>
                    <span className="truncate">{candidate.full_name ?? 'Unnamed'}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {candidate.total_experience.toFixed(0)} yrs
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Actions">
              <Item icon={Sun} onSelect={() => { setTheme('light'); onOpenChange(false) }}>
                Switch to light theme
              </Item>
              <Item icon={Moon} onSelect={() => { setTheme('dark'); onOpenChange(false) }}>
                Switch to dark theme
              </Item>
              {isStaff && (
                <Item
                  onSelect={() => {
                    setAnonymized(!anonymized)
                    onOpenChange(false)
                  }}
                >
                  {anonymized ? 'Turn off blind review' : 'Turn on blind review'}
                </Item>
              )}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function Item({
  icon: Icon,
  children,
  onSelect,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  onSelect: () => void
  value?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm',
        'data-[selected=true]:bg-muted data-[selected=true]:text-foreground',
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {children}
    </Command.Item>
  )
}
