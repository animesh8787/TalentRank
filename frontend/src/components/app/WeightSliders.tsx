import * as React from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw, Shuffle } from 'lucide-react'

import { DIMENSION_META, cn, weightsTotalPercent } from '@/lib/utils'
import { Button, Input, Slider, Tooltip } from '@/components/ui/primitives'
import type { DimensionKey, JobWeights } from '@/types'

// Mirrors the backend's DEFAULT_WEIGHTS in scoring.py and the Job column
// defaults in models.py — keep all three in sync when changing them.
const DEFAULTS: JobWeights = {
  skills: 0.3,
  experience: 0.2,
  education: 0.1,
  semantic: 0.15,
  location: 0.1,
  projects: 0.1,
  certifications: 0.05,
}

const HINTS: Record<DimensionKey, string> = {
  skills: 'How many of the required skills the resume actually evidences — exact, aliased or semantic matches.',
  experience: "Years of experience against the role's minimum, with credit for close misses.",
  education: 'Highest qualification against the minimum for the role.',
  semantic: 'Overall meaning-level similarity between the resume and the job description — also called keyword relevance.',
  location: 'Whether the candidate is in the right place (ignored for remote roles).',
  projects: 'Whether listed projects actually demonstrate the required skills, plus how complete that section is.',
  certifications: 'Certifications on file — a bonus signal, capped once a couple are present.',
}

/**
 * Recruiter-facing scoring-weight editor. Unlike a slider that always
 * normalises to 100% behind the scenes, these are the literal percentages
 * that get saved — so the total can be wrong, and the UI says so plainly
 * rather than silently rescaling around it (the "must total exactly 100%"
 * rule the backend's JobWeightsInput also enforces).
 */
export function WeightSliders({
  value,
  onChange,
  compact,
}: {
  value: JobWeights
  onChange: (next: JobWeights) => void
  compact?: boolean
}) {
  const totalPct = weightsTotalPercent(value)
  const isValid = Math.abs(totalPct - 100) < 0.5
  const isDefault = DIMENSION_META.every(
    (meta) => Math.abs((value[meta.key] ?? 0) - DEFAULTS[meta.key]) < 0.001,
  )

  const distributeEvenly = () => {
    const share = Math.round(100 / DIMENSION_META.length) / 100
    const next = { ...value }
    for (const meta of DIMENSION_META) next[meta.key] = share
    // Put any rounding remainder on skills so the total is exact.
    const remainder = 1 - DIMENSION_META.length * share
    next.skills = Math.round((next.skills + remainder) * 100) / 100
    onChange(next)
  }

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {DIMENSION_META.map((meta) => {
        const raw = value[meta.key] ?? 0
        const pct = Math.round(raw * 100)
        return (
          <div key={meta.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Tooltip content={HINTS[meta.key]}>
                <label
                  htmlFor={`weight-${meta.key}`}
                  className="flex cursor-help items-center gap-1.5 text-xs font-medium"
                >
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  />
                  {meta.label}
                </label>
              </Tooltip>
              <span className="flex shrink-0 items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={pct}
                  onChange={(event) => {
                    const next = Math.max(0, Math.min(100, Number(event.target.value) || 0))
                    onChange({ ...value, [meta.key]: next / 100 })
                  }}
                  className="tabular h-6 w-14 px-1.5 text-right text-xs"
                  aria-label={`${meta.label} weight, percent`}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </span>
            </div>
            <Slider
              id={`weight-${meta.key}`}
              value={[pct]}
              min={0}
              max={100}
              step={1}
              onValueChange={([next]) => onChange({ ...value, [meta.key]: next / 100 })}
              aria-label={`${meta.label} weight`}
              aria-valuetext={`${pct} percent of the total score`}
            />
          </div>
        )
      })}

      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium',
          isValid
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-destructive/30 bg-destructive/10 text-destructive',
        )}
        role={isValid ? 'status' : 'alert'}
      >
        {isValid ? (
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="tabular">{totalPct.toFixed(0)}%</span>
        <span>
          {isValid
            ? 'Weights total 100%.'
            : `Weights must total exactly 100% — currently ${totalPct.toFixed(0)}%.`}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={distributeEvenly}>
          <Shuffle aria-hidden="true" />
          Distribute evenly
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...DEFAULTS })}
          disabled={isDefault}
        >
          <RotateCcw aria-hidden="true" />
          Reset to default
        </Button>
      </div>
    </div>
  )
}

export { DEFAULTS as DEFAULT_WEIGHTS }
