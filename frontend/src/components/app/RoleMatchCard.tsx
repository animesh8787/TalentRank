import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Briefcase,
  ChevronDown,
  Info,
  Lightbulb,
  MapPin,
  TrendingUp,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge, Tooltip } from '@/components/ui/primitives'
import { ChipRow, ScoreBadge, ScoreBreakdown } from '@/components/app/shared'
import type { RoleMatch, SkillGapItem } from '@/types'

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  high: { label: 'High priority', className: 'text-destructive border-destructive/30 bg-destructive/10' },
  medium: { label: 'Worth doing', className: 'text-warning border-warning/30 bg-warning/10' },
  low: { label: 'Nice to have', className: 'text-muted-foreground border-border bg-muted' },
}

const GAP_STATUS_META: Record<SkillGapItem['status'], { label: string; className: string; textClassName: string }> = {
  strong: { label: 'Strong match', className: 'border-success/30 bg-success/10 text-success', textClassName: 'text-success' },
  developing: { label: 'Needs improvement', className: 'border-warning/30 bg-warning/10 text-warning', textClassName: 'text-warning' },
  missing: { label: 'Missing', className: 'border-destructive/30 bg-destructive/10 text-destructive', textClassName: 'text-destructive' },
}

function GapChip({ item }: { item: SkillGapItem }) {
  return (
    <Tooltip
      content={
        item.evidence
          ? `${item.required ? 'Required' : 'Preferred'} · ${item.evidence}`
          : item.required
            ? 'Required for this role'
            : 'Preferred for this role'
      }
    >
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
          GAP_STATUS_META[item.status].className,
        )}
      >
        <span className="truncate">{item.skill}</span>
        {!item.required && (
          <span className="shrink-0 rounded-sm bg-foreground/10 px-1 text-[9px] font-semibold uppercase tracking-wide">
            Pref
          </span>
        )}
      </span>
    </Tooltip>
  )
}

/** One role from the candidate's own point of view, expandable to show the
 * skill gap and concrete recommendations behind the score. */
export function RoleMatchCard({
  role,
  expanded,
  onToggle,
}: {
  role: RoleMatch
  expanded: boolean
  onToggle: () => void
}) {
  const { job } = role
  const strong = role.skill_gap.filter((s) => s.status === 'strong')
  const developing = role.skill_gap.filter((s) => s.status === 'developing')
  const missing = role.skill_gap.filter((s) => s.status === 'missing')

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-semibold">{job.title}</h3>
            {job.seniority && (
              <Badge variant="outline" className="font-normal capitalize">
                {job.seniority.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {job.department && (
              <span className="flex items-center gap-1">
                <Briefcase className="size-3" aria-hidden="true" />
                {job.department}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {job.remote_ok ? 'Remote' : job.location ?? 'Location not set'}
            </span>
          </p>
        </div>
        <ScoreBadge score={role.overall_score} size="default" />
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="animate-fade-up space-y-5 border-t border-border p-4">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{role.summary}</p>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Score breakdown
              </h4>
              <ScoreBreakdown dimensions={role.dimensions} compact />
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Skill gap for this role
              </h4>
              {strong.length > 0 && (
                <SkillGapGroup label="Strong match" items={strong} />
              )}
              {developing.length > 0 && (
                <SkillGapGroup label="Needs improvement" items={developing} />
              )}
              {missing.length > 0 && (
                <SkillGapGroup label="Missing" items={missing} />
              )}
              {!role.skill_gap.length && (
                <p className="text-xs text-muted-foreground">This role has no required or preferred skills listed.</p>
              )}
            </div>
          </div>

          {role.recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lightbulb className="size-3.5 text-primary" aria-hidden="true" />
                What would improve this match
              </h4>
              <ul className="space-y-1.5">
                {role.recommendations.slice(0, 6).map((rec, index) => {
                  const meta = PRIORITY_META[rec.priority] ?? PRIORITY_META.low
                  return (
                    <li key={index} className="flex items-start gap-2 rounded-md border border-border p-2.5 text-xs">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">{rec.title}</span>
                          <Badge variant="outline" className={cn('font-normal', meta.className)}>
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{rec.message}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="size-3" aria-hidden="true" />
            <span>Based on this role's actual scoring weights and your current profile.</span>
            <Link to="/my-resume?tab=edit" className="ml-auto flex items-center gap-1 font-medium text-primary hover:underline">
              <TrendingUp className="size-3" aria-hidden="true" />
              Improve my profile
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function SkillGapGroup({ label, items }: { label: string; items: SkillGapItem[] }) {
  return (
    <div className="space-y-1">
      <p className={cn('text-[11px] font-medium', GAP_STATUS_META[items[0].status].textClassName)}>
        {label} ({items.length})
      </p>
      <ChipRow
        items={items}
        max={10}
        render={(item: SkillGapItem, index) => <GapChip key={index} item={item} />}
      />
    </div>
  )
}

