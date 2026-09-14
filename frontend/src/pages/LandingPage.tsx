import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Columns3,
  EyeOff,
  FileSearch,
  Github,
  HeartPulse,
  Menu,
  Sparkles,
  SlidersHorizontal,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge, Button } from '@/components/ui/primitives'
import { Avatar, ScoreBadge, ScoreBreakdown } from '@/components/app/shared'
import { Reveal } from '@/components/app/Reveal'
import type { DimensionKey, DimensionScore } from '@/types'

const GITHUB_URL = 'https://github.com/animesh8787/TalentRank'
const API_DOCS_URL = 'https://talentrank-api.onrender.com/docs'

/* -------------------------------------------------------------------------- */
/* Static, illustrative example data for the hero/feature mockups.            */
/* Nothing here calls the API — this page must render for signed-out visitors */
/* even if the backend is asleep (Render free tier spins down when idle).     */
/* -------------------------------------------------------------------------- */
const EXAMPLE_DIMENSIONS: Record<DimensionKey, DimensionScore> = {
  skills: { key: 'skills', label: 'Skills', score: 0.91, weight: 0.35, contribution: 0.32, detail: 'Matched 8 of 9 required skills.' },
  experience: { key: 'experience', label: 'Experience', score: 1, weight: 0.25, contribution: 0.25, detail: '6 yrs meets the 5 yr minimum.' },
  education: { key: 'education', label: 'Education', score: 1, weight: 0.15, contribution: 0.15, detail: 'Masters meets the Masters requirement.' },
  semantic: { key: 'semantic', label: 'Relevance', score: 0.78, weight: 0.15, contribution: 0.12, detail: '78% overall textual similarity to the job description.' },
  location: { key: 'location', label: 'Location', score: 1, weight: 0.1, contribution: 0.1, detail: 'Based in Bangalore.' },
}

const EXAMPLE_RANKING = [
  { name: 'Meera Krishnan', role: 'Senior ML Engineer', score: 0.94 },
  { name: 'Rahul Verma', role: 'Backend Engineer', score: 0.87 },
  { name: 'Ayesha Khan', role: 'Data Scientist', score: 0.81 },
]

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Explainable scoring',
    description:
      'Five dimensions — skills, experience, education, relevance, location — each with a reason, not just a number.',
  },
  {
    icon: Sparkles,
    title: 'Semantic matching',
    description:
      'Understands that "ML" means machine learning and "React.js" means React, without a hardcoded synonym list.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Live weight tuning',
    description:
      'Drag a slider, watch the ranking reorder instantly. Nothing is saved until you apply it to the role.',
  },
  {
    icon: EyeOff,
    title: 'Blind review mode',
    description:
      'Hide names, contact details and universities for a first pass focused on skills — redaction happens server-side.',
  },
  {
    icon: Columns3,
    title: 'Visual pipeline',
    description:
      'Drag candidates through New → Shortlisted → Interviewing → Hired, with a keyboard-accessible fallback for every action.',
  },
  {
    icon: HeartPulse,
    title: 'Resume health check',
    description:
      'Candidates see exactly why a resume might score badly before a recruiter ever opens it — and how to fix it.',
  },
] as const

const STEPS = [
  {
    icon: UploadCloud,
    title: 'Upload',
    description: 'Drop in resumes — PDF, DOCX or TXT. Live progress, one file or fifty at once.',
  },
  {
    icon: BarChart3,
    title: 'Score',
    description: 'Every resume is parsed and scored against every open role, automatically, in seconds.',
  },
  {
    icon: CheckCircle2,
    title: 'Decide',
    description: 'Rank, compare, tune the weights, and move real candidates through a real pipeline.',
  },
] as const

const STACK = ['FastAPI', 'React 19', 'Firebase Auth', 'Sentence Transformers', 'SQLAlchemy']

export function LandingPage() {
  const [scrolled, setScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <Nav scrolled={scrolled} mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen((v) => !v)} />

      <main id="main">
        <Hero />
        <StackStrip />
        <Features />
        <SpotlightExplainability />
        <SpotlightBlindReview />
        <HowItWorks />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Nav                                                                        */
/* -------------------------------------------------------------------------- */
function Nav({
  scrolled,
  mobileOpen,
  onToggleMobile,
}: {
  scrolled: boolean
  mobileOpen: boolean
  onToggleMobile: () => void
}) {
  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How it works' },
  ]

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled ? 'border-b border-border bg-background/80 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileSearch className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold tracking-tight">TalentRank</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex" aria-label="Page sections">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="size-3.5" aria-hidden="true" />
            GitHub
          </a>
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/login?mode=register">
              Get started free
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          onClick={onToggleMobile}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Page sections">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={onToggleMobile}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Github className="size-3.5" aria-hidden="true" />
              GitHub
            </a>
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <Button variant="outline" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/login?mode=register">Get started free</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(600px circle at 15% 10%, hsl(var(--primary) / 0.16), transparent 60%),' +
            'radial-gradient(500px circle at 85% 25%, hsl(var(--accent) / 0.12), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Badge variant="outline" className="mb-5 gap-1.5 border-primary/30 bg-primary/5 text-primary">
              <Sparkles className="size-3" aria-hidden="true" />
              Explainable resume screening
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              Know exactly why a candidate{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                ranks where they do.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              TalentRank scores every resume against a role in seconds — skills, experience,
              education and relevance, each traced back to the line of the resume that earned it.
              No black box, no guessing.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/login?mode=register">
                  Get started free
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free to use. No credit card. Takes about a minute to see your first ranked list.
            </p>
          </Reveal>

          <Reveal delay={150}>
            <HeroVisual />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** Composed from the exact same components the real app uses, with static
 * illustrative numbers — a live product visual, not a stock screenshot. */
function HeroVisual() {
  return (
    <div className="relative mx-auto max-w-md lg:max-w-none">
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/10 via-transparent to-accent/10 blur-2xl"
        aria-hidden="true"
      />

      {/* Ranked list card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-pop">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">Senior ML Engineer · Ranked</p>
          <Badge variant="success" className="tabular">
            94% avg
          </Badge>
        </div>
        <ul className="space-y-2.5">
          {EXAMPLE_RANKING.map((candidate, index) => (
            <li key={candidate.name} className="flex items-center gap-3">
              <span className="tabular w-4 shrink-0 text-xs font-bold text-muted-foreground">
                {index + 1}
              </span>
              <Avatar name={candidate.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{candidate.name}</p>
                <p className="truncate text-xs leading-tight text-muted-foreground">{candidate.role}</p>
              </div>
              <ScoreBadge score={candidate.score} size="sm" showLabel={false} />
            </li>
          ))}
        </ul>
      </div>

      {/* Floating explanation card */}
      <div className="absolute -bottom-8 -right-4 w-60 rotate-2 rounded-xl border border-border bg-card p-3.5 shadow-pop sm:-right-10 sm:w-64">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Why this score
        </p>
        <ScoreBreakdown dimensions={EXAMPLE_DIMENSIONS} compact />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Stack strip — honest, not fabricated social proof                         */
/* -------------------------------------------------------------------------- */
function StackStrip() {
  return (
    <section className="border-y border-border bg-muted/30 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Built on
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {STACK.map((name) => (
              <span key={name} className="text-sm font-semibold text-muted-foreground/80">
                {name}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Feature grid                                                               */
/* -------------------------------------------------------------------------- */
function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Everything a screening tool should have done from the start
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Built by rebuilding one, end to end — backend, scoring engine and interface — so nothing
          here is a bolt-on afterthought.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={index * 60}>
            <div className="h-full rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30">
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-bold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Spotlight: explainability                                                  */
/* -------------------------------------------------------------------------- */
function SpotlightExplainability() {
  const matched = ['python', 'machine learning', 'deep learning', 'sql']
  const missing = ['kubernetes']

  return (
    <section className="border-t border-border bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
              Explainability
            </Badge>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              See exactly why — not just a number
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Every match comes with the resume sentence that earned it. Matched skills, missing
              skills, and a radar chart that shows the shape of the fit at a glance — so a 73% means
              something concrete, not a mystery.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Semantic matching catches "ML" and "React.js" without a hardcoded synonym list',
                'Missing-skill chips tell a recruiter exactly what to ask about in the interview',
                'Live weight sliders re-rank instantly — nothing saved until you apply it',
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                Strong match (91%). Strongest signal: experience (100%). Weakest: relevance (78%).
              </p>
              <ScoreBreakdown dimensions={EXAMPLE_DIMENSIONS} />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-success">Present</p>
                  <div className="flex flex-wrap gap-1">
                    {matched.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                      >
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-destructive">Missing</p>
                  <div className="flex flex-wrap gap-1">
                    {missing.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                      >
                        <XCircle className="size-3" aria-hidden="true" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Spotlight: blind review                                                    */
/* -------------------------------------------------------------------------- */
function SpotlightBlindReview() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="warning">
                  <EyeOff className="size-3" aria-hidden="true" />
                  Blind review on
                </Badge>
              </div>
              <ul className="space-y-3">
                {[
                  { name: 'Swift Falcon #4821', role: 'Scientist', score: 0.92 },
                  { name: 'Olive Grove #8910', role: 'Senior Software Developer', score: 0.87 },
                  { name: 'Amber Forge #1156', role: '4 years experience', score: 0.83 },
                ].map((row) => (
                  <li key={row.name} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                    <Avatar name={row.name} size="sm" anonymized />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{row.name}</p>
                      <p className="truncate text-xs leading-tight text-muted-foreground">{row.role}</p>
                    </div>
                    <ScoreBadge score={row.score} size="sm" showLabel={false} />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={150} className="order-1 lg:order-2">
            <Badge variant="outline" className="mb-4 border-accent/30 bg-accent/5 text-accent">
              Bias-reduced review
            </Badge>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Cut bias with one click
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Toggle blind review and every name, contact detail, university and precise location
              is replaced with a stable alias — server-side, so the real values never even reach
              the browser. Skills, experience and evidence stay fully visible, because that's what
              a first pass should actually judge on.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Redaction happens on the backend, not hidden with CSS in the browser',
                'The same candidate keeps the same alias across the whole review',
                'Turn it off at any point once you\'re ready to see full profiles',
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */
function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            From resume pile to ranked list
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">Three steps, no manual re-parsing.</p>
        </Reveal>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-3">
          <div
            className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-border sm:block"
            aria-hidden="true"
          />
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 100} className="relative text-center">
              <div className="relative mx-auto flex size-16 items-center justify-center rounded-full border border-border bg-card shadow-card">
                <step.icon className="size-6 text-primary" aria-hidden="true" />
                <span className="tabular absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold tracking-tight">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-[22ch] text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                  */
/* -------------------------------------------------------------------------- */
function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-primary py-20 text-primary-foreground sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, white 0, transparent 45%), radial-gradient(circle at 85% 75%, white 0, transparent 40%)',
        }}
        aria-hidden="true"
      />
      <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ready to see it for yourself?
        </h2>
        <p className="mt-4 text-lg text-primary-foreground/85">
          Create an account, upload a resume, and watch it get scored and explained in seconds.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" variant="secondary" asChild>
            <Link to="/login?mode=register">
              Create your free account
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            asChild
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link to="/login">Sign in instead</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */
function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <FileSearch className="size-3.5" aria-hidden="true" />
              </span>
              <span className="text-sm font-extrabold tracking-tight">TalentRank</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Explainable resume screening and candidate ranking.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Features', href: '#features' },
              { label: 'How it works', href: '#how-it-works' },
              { label: 'Sign in', to: '/login' },
              { label: 'Get started free', to: '/login?mode=register' },
            ]}
          />

          <FooterColumn
            title="Resources"
            links={[
              { label: 'GitHub repository', href: GITHUB_URL, external: true },
              { label: 'API documentation', href: API_DOCS_URL, external: true },
            ]}
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Open source
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              MIT licensed. Fork it, run it yourself, or read exactly how the scoring works.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} TalentRank. Built for recruiters, engineered for candidates.
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Github className="size-3.5" aria-hidden="true" />
            Star on GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href?: string; to?: string; external?: boolean }[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link to={link.to} className="text-sm text-muted-foreground hover:text-foreground">
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noreferrer noopener' : undefined}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
