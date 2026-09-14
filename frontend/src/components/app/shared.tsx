import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  MinusCircle,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { BAND_CLASS, BAND_LABEL, DIMENSION_META, band, cn, initials, pct } from '@/lib/utils'
import { Badge, Card, Skeleton, Tooltip } from '@/components/ui/primitives'
import type { DimensionKey, DimensionScore, MatchedSkill } from '@/types'

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('space-y-4 p-4 sm:p-6', className)}>{children}</div>
}

/* -------------------------------------------------------------------------- */
/* Score display                                                              */
/* -------------------------------------------------------------------------- */
const BAND_ICON = {
  strong: CheckCircle2,
  good: Sparkles,
  partial: MinusCircle,
  weak: CircleDashed,
} as const

/** Score pill — colour is always paired with an icon and a word. */
export function ScoreBadge({
  score,
  size = 'default',
  showLabel = true,
}: {
  score: number
  size?: 'sm' | 'default' | 'lg'
  showLabel?: boolean
}) {
  const b = band(score)
  const Icon = BAND_ICON[b]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-semibold',
        BAND_CLASS[b],
        size === 'sm' && 'px-1.5 py-0.5 text-xs',
        size === 'default' && 'px-2 py-1 text-sm',
        size === 'lg' && 'px-3 py-1.5 text-base',
      )}
    >
      <Icon className={cn(size === 'sm' ? 'size-3' : 'size-4')} aria-hidden="true" />
      <span className="tabular">{pct(score)}</span>
      {showLabel && <span className="hidden font-medium sm:inline">{BAND_LABEL[b]}</span>}
    </span>
  )
}

/** Horizontal bar for one scoring dimension. */
export function ScoreBar({
  dimensionKey,
  label,
  score,
  weight,
  detail,
  compact,
}: {
  dimensionKey: DimensionKey
  label: string
  score: number
  weight?: number
  detail?: string
  compact?: boolean
}) {
  const color = `hsl(var(--dim-${dimensionKey}))`
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span
            className="size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {weight !== undefined && (
            <span className="tabular text-[10px] text-muted-foreground">
              ×{weight.toFixed(2)}
            </span>
          )}
          <span className="tabular font-semibold">{pct(score)}</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={Math.round(score * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct(score)}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(2, score * 100)}%`, backgroundColor: color }}
        />
      </div>
      {detail && !compact && <p className="text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

/** The five-dimension breakdown, sorted by contribution. */
export function ScoreBreakdown({
  dimensions,
  compact,
}: {
  dimensions: Record<DimensionKey, DimensionScore>
  compact?: boolean
}) {
  const ordered = DIMENSION_META.map((meta) => dimensions[meta.key]).filter(Boolean)
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {ordered.map((dimension) => (
        <ScoreBar
          key={dimension.key}
          dimensionKey={dimension.key}
          label={dimension.label}
          score={dimension.score}
          weight={dimension.weight}
          detail={dimension.detail}
          compact={compact}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Skill chips                                                                */
/* -------------------------------------------------------------------------- */
export function SkillChip({
  skill,
  matched,
}: {
  skill: MatchedSkill | { required: string; kind: 'missing' }
  matched?: boolean
}) {
  const isMissing = skill.kind === 'missing'
  const isSemantic = skill.kind === 'semantic'
  const full = skill as MatchedSkill

  const chip = (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        isMissing
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : isSemantic
            ? 'border-accent/30 bg-accent/10 text-accent'
            : 'border-success/30 bg-success/10 text-success',
      )}
    >
      {isMissing ? (
        <XCircle className="size-3 shrink-0" aria-hidden="true" />
      ) : isSemantic ? (
        <Sparkles className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{skill.required}</span>
    </span>
  )

  if (isMissing) {
    return <Tooltip content="Not found anywhere in this resume.">{chip}</Tooltip>
  }
  return (
    <Tooltip
      content={
        isSemantic
          ? `Matched semantically to “${full.matched_with}” (${pct(full.similarity)} similar).${full.evidence ? ` “${full.evidence}”` : ''}`
          : `Exact match.${full.evidence ? ` “${full.evidence}”` : ''}`
      }
    >
      {chip}
    </Tooltip>
  )
}

/** Wraps before shrinking; overflow becomes an operable disclosure. */
export function ChipRow({
  items,
  max = 6,
  render,
}: {
  items: unknown[]
  max?: number
  render: (item: never, index: number) => React.ReactNode
}) {
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? items : items.slice(0, max)
  const hidden = items.length - visible.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((item, index) => render(item as never, index))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{hidden} more
        </button>
      )}
      {expanded && items.length > max && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show less
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */
export function Avatar({
  name,
  size = 'default',
  anonymized,
}: {
  name: string | null | undefined
  size?: 'sm' | 'default' | 'lg'
  anonymized?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold',
        anonymized
          ? 'bg-accent/15 text-accent'
          : 'bg-primary/10 text-primary',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'default' && 'size-8 text-xs',
        size === 'lg' && 'size-12 text-base',
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                  */
/* -------------------------------------------------------------------------- */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'primary' | 'accent' | 'success' | 'warning'
  loading?: boolean
}) {
  const toneClass = {
    default: 'text-muted-foreground bg-muted',
    primary: 'text-primary bg-primary/10',
    accent: 'text-accent bg-accent/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
  }[tone]

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="tabular text-2xl font-bold leading-none tracking-tight">{value}</p>
          )}
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('rounded-md p-2', toneClass)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Health score                                                               */
/* -------------------------------------------------------------------------- */
export function HealthPill({ score }: { score: number }) {
  const variant = score >= 85 ? 'success' : score >= 70 ? 'default' : score >= 50 ? 'warning' : 'destructive'
  const Icon = score >= 70 ? CheckCircle2 : AlertTriangle
  return (
    <Tooltip content={`Resume health ${Math.round(score)}/100 — how cleanly this resume could be read.`}>
      <Badge variant={variant as never} className="cursor-help">
        <Icon className="size-3" aria-hidden="true" />
        <span className="tabular">{Math.round(score)}</span>
      </Badge>
    </Tooltip>
  )
}

/* -------------------------------------------------------------------------- */
/* Loading rows                                                               */
/* -------------------------------------------------------------------------- */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading results…</span>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 rounded-md border border-border p-3">
          <Skeleton className="size-8 rounded-full" />
          {Array.from({ length: cols }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn('h-4', colIndex === 0 ? 'w-40' : 'w-16')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
