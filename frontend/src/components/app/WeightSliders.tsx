import * as React from 'react'
import { RotateCcw } from 'lucide-react'

import { DIMENSION_META, cn } from '@/lib/utils'
import { Button, Slider, Tooltip } from '@/components/ui/primitives'
import type { DimensionKey, JobWeights } from '@/types'

const DEFAULTS: JobWeights = {
  skills: 0.35,
  experience: 0.25,
  education: 0.15,
  semantic: 0.15,
  location: 0.1,
}

const HINTS: Record<DimensionKey, string> = {
  skills: 'How many of the required skills the resume actually evidences.',
  experience: 'Years of experience against the minimum for the role.',
  education: 'Highest qualification against the minimum for the role.',
  semantic: 'Overall meaning-level similarity between the resume and the job description.',
  location: 'Whether the candidate is in the right place (ignored for remote roles).',
}

/**
 * Live weight tuning. Weights are shown as their normalised share so the
 * numbers always add up to 100% no matter what the raw slider values are —
 * the server normalises identically before scoring.
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
  const total = DIMENSION_META.reduce((sum, meta) => sum + (value[meta.key] ?? 0), 0)
  const isDefault = DIMENSION_META.every(
    (meta) => Math.abs((value[meta.key] ?? 0) - DEFAULTS[meta.key]) < 0.001,
  )

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {DIMENSION_META.map((meta) => {
        const raw = value[meta.key] ?? 0
        const share = total > 0 ? raw / total : 0
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
              <span className="tabular text-xs font-semibold">
                {(share * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              id={`weight-${meta.key}`}
              value={[raw * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([next]) => onChange({ ...value, [meta.key]: next / 100 })}
              aria-label={`${meta.label} weight`}
              aria-valuetext={`${(share * 100).toFixed(0)} percent of the total score`}
            />
          </div>
        )
      })}

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">
          {total === 0
            ? 'All weights are zero — default weighting will be used.'
            : 'Shares are normalised, so they always total 100%.'}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...DEFAULTS })}
          disabled={isDefault}
        >
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  )
}

export { DEFAULTS as DEFAULT_WEIGHTS }
