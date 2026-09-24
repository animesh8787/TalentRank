import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import type { DimensionKey } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 0.734 -> "73%" */
export const pct = (value: number, digits = 0) =>
  `${(value * 100).toFixed(digits)}%`

/** Score band used for colour, icon and label — never colour alone. */
export type Band = 'strong' | 'good' | 'partial' | 'weak'

export function band(score: number): Band {
  if (score >= 0.8) return 'strong'
  if (score >= 0.6) return 'good'
  if (score >= 0.4) return 'partial'
  return 'weak'
}

export const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong',
  good: 'Good',
  partial: 'Partial',
  weak: 'Weak',
}

export const BAND_CLASS: Record<Band, string> = {
  strong: 'text-success border-success/30 bg-success/10',
  good: 'text-primary border-primary/30 bg-primary/10',
  partial: 'text-warning border-warning/30 bg-warning/10',
  weak: 'text-muted-foreground border-border bg-muted',
}

export function initials(name: string | null | undefined) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatRelative(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
  ]
  for (const [unit, secondsInUnit] of table) {
    if (Math.abs(seconds) >= secondsInUnit || unit === 'second') {
      return rtf.format(Math.round(seconds / secondsInUnit), unit)
    }
  }
  return '—'
}

export function formatSalary(min: number | null, max: number | null) {
  if (!min && !max) return null
  const format = (n: number) =>
    n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `${Math.round(n / 1000)}K`
  if (min && max) return `₹${format(min)} – ₹${format(max)}`
  return `₹${format((min ?? max) as number)}`
}

/** Sum of a weight set as a 0-100 percentage — used to validate the
 * "must total exactly 100%" rule both live in WeightSliders and again at
 * submit time in JobForm, without duplicating the arithmetic. */
export function weightsTotalPercent(weights: Record<DimensionKey, number>) {
  return DIMENSION_META.reduce((sum, meta) => sum + (weights[meta.key] ?? 0), 0) * 100
}

export const DIMENSION_META = [
  { key: 'skills', label: 'Skills', color: 'hsl(var(--dim-skills))' },
  { key: 'experience', label: 'Experience', color: 'hsl(var(--dim-experience))' },
  { key: 'education', label: 'Education', color: 'hsl(var(--dim-education))' },
  { key: 'semantic', label: 'Relevance', color: 'hsl(var(--dim-semantic))' },
  { key: 'location', label: 'Location', color: 'hsl(var(--dim-location))' },
  { key: 'projects', label: 'Projects', color: 'hsl(var(--dim-projects))' },
  { key: 'certifications', label: 'Certifications', color: 'hsl(var(--dim-certifications))' },
] as const

export const STAGE_META: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  new: { label: 'New', className: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' },
  shortlisted: { label: 'Shortlisted', className: 'bg-primary/10 text-primary border-primary/30', dot: 'bg-primary' },
  interviewing: { label: 'Interviewing', className: 'bg-accent/10 text-accent border-accent/30', dot: 'bg-accent' },
  offer: { label: 'Offer', className: 'bg-success/10 text-success border-success/30', dot: 'bg-success' },
  hired: { label: 'Hired', className: 'bg-success text-success-foreground border-success', dot: 'bg-success-foreground' },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
}

export const STAGE_ORDER = [
  'new', 'shortlisted', 'interviewing', 'offer', 'hired', 'rejected',
] as const

/** Candidate profile fields that make the "what should I do next" dashboard
 * useful — each with the plain-language ask shown when it's missing. */
export interface CompletenessInput {
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  headline: string | null
  total_experience: number
  highest_qualification: string | null
  linkedin_url: string | null
  github_url: string | null
  skills: unknown[]
  experiences: unknown[]
  educations: unknown[]
  projects: unknown[]
  certifications: unknown[]
}

export function profileCompleteness(candidate: CompletenessInput) {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Add your name, email and phone', done: !!(candidate.full_name && candidate.email && candidate.phone) },
    { label: 'Add your location', done: !!candidate.location },
    { label: 'Add a headline describing your current role', done: !!candidate.headline },
    { label: 'Confirm your years of experience', done: candidate.total_experience > 0 },
    { label: 'Add your highest qualification', done: !!candidate.highest_qualification },
    { label: 'List at least 5 skills', done: candidate.skills.length >= 5 },
    { label: 'Add at least one work experience entry', done: candidate.experiences.length > 0 },
    { label: 'Add your education history', done: candidate.educations.length > 0 },
    { label: 'Add at least one project', done: candidate.projects.length > 0 },
    { label: 'Add a LinkedIn or GitHub link', done: !!(candidate.linkedin_url || candidate.github_url) },
  ]
  const done = checks.filter((c) => c.done).length
  return {
    percent: Math.round((100 * done) / checks.length),
    missing: checks.filter((c) => !c.done).map((c) => c.label),
  }
}
