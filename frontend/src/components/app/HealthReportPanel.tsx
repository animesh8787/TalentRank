import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/primitives'
import type { HealthReport } from '@/types'

const STATUS_META = {
  pass: { icon: CheckCircle2, className: 'text-success', label: 'Pass' },
  warn: { icon: AlertTriangle, className: 'text-warning', label: 'Needs attention' },
  fail: { icon: XCircle, className: 'text-destructive', label: 'Problem' },
} as const

export function HealthReportPanel({
  report,
  showIntro = true,
}: {
  report: HealthReport
  showIntro?: boolean
}) {
  const failing = report.checks.filter((check) => check.status !== 'pass')

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center gap-4 rounded-lg border border-border p-4">
        <ScoreRing score={report.score} />
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight">{report.grade}</p>
          <p className="text-xs text-muted-foreground">
            {showIntro
              ? 'How cleanly an applicant tracking system can read this resume. It does not judge the person — only the file.'
              : `${failing.length} of ${report.checks.length} checks need attention.`}
          </p>
        </div>
      </div>

      {report.warnings.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Extraction warnings
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-warning">
            {report.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {report.checks.map((check) => {
          const meta = STATUS_META[check.status]
          const Icon = meta.icon
          return (
            <li
              key={check.key}
              className={cn(
                'rounded-md border p-3',
                check.status === 'pass' ? 'border-border' : 'border-border bg-muted/30',
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{check.label}</p>
                    {/* Status is carried by icon + text, never colour alone. */}
                    <Badge
                      variant={
                        check.status === 'pass'
                          ? 'success'
                          : check.status === 'warn'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{check.message}</p>
                  {check.fix && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded bg-primary/5 p-2 text-xs text-foreground">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span>{check.fix}</span>
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100)
  const color =
    score >= 85
      ? 'hsl(var(--success))'
      : score >= 70
        ? 'hsl(var(--primary))'
        : score >= 50
          ? 'hsl(var(--warning))'
          : 'hsl(var(--destructive))'

  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Resume health ${Math.round(score)} out of 100`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-bold">
        {Math.round(score)}
      </span>
    </div>
  )
}
