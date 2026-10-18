import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Github, Menu, X } from '@/components/ui/icons'

import { Button } from '@/components/ui/primitives'

const GITHUB_URL = 'https://github.com/animesh8787/TalentRank'
const API_DOCS_URL = 'https://talentrank-api.onrender.com/docs'

/* Screenshots are real captures of the running app on the repo's seeded demo
 * data (python -m app.seed). Nothing on this page calls the API, so it renders
 * for signed-out visitors even while the backend is asleep. */
type Shot = { src: string; alt: string; caption: string }
const SHOTS: Record<'dashboard' | 'ranking' | 'drawer' | 'blind' | 'upload', Shot> = {
  dashboard: {
    src: '/screens/dashboard.webp',
    alt: 'TalentRank dashboard showing resume counts, open roles and the pipeline by stage.',
    caption: 'Dashboard on the seeded demo data.',
  },
  ranking: {
    src: '/screens/job-ranking.webp',
    alt: 'A job page with candidates ranked by match score and the scoring weights.',
    caption: 'Job ranking with the scoring weights. Demo data.',
  },
  drawer: {
    src: '/screens/candidate-drawer.webp',
    alt: 'Candidate drawer with the per-dimension score breakdown, matched skills and missing skills.',
    caption: 'Candidate drawer: the breakdown behind one score. Demo data.',
  },
  blind: {
    src: '/screens/blind-review.webp',
    alt: 'The same ranking with blind review on: candidates appear under aliases and contact details are hidden.',
    caption: 'Blind review on. Names and contact details are withheld by the server. Demo data.',
  },
  upload: {
    src: '/screens/upload.webp',
    alt: 'Upload page with a drop zone for PDF, DOCX and TXT resumes.',
    caption: 'Resume upload.',
  },
}

function Screenshot({ shot, eager = false }: { shot: Shot; eager?: boolean }) {
  return (
    <figure>
      <img
        src={shot.src}
        alt={shot.alt}
        width={1440}
        height={900}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="h-auto w-full border border-border bg-card"
      />
      <figcaption className="mt-2 text-xs text-muted-foreground">{shot.caption}</figcaption>
    </figure>
  )
}

const STACK = ['FastAPI', 'React 19', 'Firebase Auth', 'Hugging Face embeddings (optional)', 'SQLAlchemy']

const FEATURE_ROWS: {
  id: string
  title: string
  body: string
  points: string[]
  shot: Shot
}[] = [
  {
    id: 'features',
    title: 'Scores come with their reasons',
    body: 'Each resume is scored on seven dimensions: skills, experience, education, relevance, location, projects and certifications. Every dimension shows its own score, its weight and the evidence behind it.',
    points: [
      'Embedding-based matching reads "React.js" as React and "Amazon Web Services" as AWS.',
      'Missing skills are listed, so a recruiter knows what to ask in the interview.',
      'Weight sliders re-rank the list live. Nothing is saved until you apply it to the role.',
    ],
    shot: SHOTS.ranking,
  },
  {
    id: 'explain',
    title: 'Open any candidate to see the breakdown',
    body: 'The candidate drawer shows the resume sentence behind each matched skill, the skills that were not found, and a radar of the fit.',
    points: [
      'Matched and missing skills sit side by side.',
      'Candidates see their own resume health check and what to fix before a recruiter opens it.',
    ],
    shot: SHOTS.drawer,
  },
  {
    id: 'blind',
    title: 'Blind review, enforced by the server',
    body: 'Switch blind review on for a role and names, contact details, universities, precise locations and resume files are withheld for everyone reviewing it. A stable alias stands in for each candidate.',
    points: [
      'Redaction happens on the backend, so the real values never reach the browser.',
      'The same candidate keeps the same alias across the whole review.',
      'Only the role owner can turn it off.',
    ],
    shot: SHOTS.blind,
  },
]

const STEPS = [
  { title: 'Upload', description: 'Drop in resumes as PDF, DOCX or TXT, one file or fifty. Progress is shown live.' },
  { title: 'Score', description: 'Every resume is parsed and scored against every open role, usually within seconds.' },
  { title: 'Decide', description: 'Rank, compare, tune the weights and move candidates through the pipeline.' },
]

export function LandingPage() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <Nav mobileOpen={mobileOpen} onToggleMobile={() => setMobileOpen((v) => !v)} />

      <main id="main">
        <Hero />
        <StackStrip />
        {FEATURE_ROWS.map((row, index) => (
          <FeatureRow key={row.id} row={row} flip={index % 2 === 1} />
        ))}
        <HowItWorks />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}

function Nav({ mobileOpen, onToggleMobile }: { mobileOpen: boolean; onToggleMobile: () => void }) {
  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How it works' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="text-base font-extrabold tracking-tight">TalentRank</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex" aria-label="Page sections">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {link.label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
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
              Get started
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
              <Link to="/login?mode=register">Get started</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <p className="mb-4 text-sm font-semibold text-primary">Explainable resume screening</p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
          Know why a candidate ranks where they do.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          TalentRank scores every resume against a role in seconds. Skills, experience, education and
          relevance are each traced back to the line of the resume that earned them.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/login?mode=register">
              Get started
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free to use. No credit card. Your first ranked list takes about a minute.
        </p>

        <div className="mt-12">
          <Screenshot shot={SHOTS.dashboard} eager />
        </div>
      </div>
    </section>
  )
}

function StackStrip() {
  return (
    <section className="border-y border-border bg-muted/30 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Built on
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {STACK.map((name) => (
            <span key={name} className="text-sm font-semibold text-muted-foreground">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureRow({ row, flip }: { row: (typeof FEATURE_ROWS)[number]; flip: boolean }) {
  return (
    <section id={row.id} className={flip ? 'border-y border-border bg-muted/30 py-16 sm:py-24' : 'py-16 sm:py-24'}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-5 lg:gap-14">
        <div className={flip ? 'lg:order-2 lg:col-span-2' : 'lg:col-span-2'}>
          <h2 className="text-3xl font-extrabold tracking-tight">{row.title}</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">{row.body}</p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-sm marker:text-muted-foreground">
            {row.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
        <div className={flip ? 'lg:order-1 lg:col-span-3' : 'lg:col-span-3'}>
          <Screenshot shot={row.shot} />
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-5 lg:gap-14">
        <div className="lg:col-span-2">
          <h2 className="text-3xl font-extrabold tracking-tight">From resume pile to ranked list</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Resumes are parsed once and scored against every open role, so there is no manual re-entry.
          </p>
        </div>
        <div className="lg:col-span-3">
          <ol className="divide-y divide-border border-y border-border">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-5 py-5">
                <span className="tabular w-6 shrink-0 text-sm font-bold text-muted-foreground">{index + 1}.</span>
                <div>
                  <h3 className="text-base font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <Screenshot shot={SHOTS.upload} />
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-t border-border bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight">See it on your own resumes</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Create an account, upload a resume, and read the score and the reasons behind it.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/login?mode=register">
              Create an account
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="text-sm font-extrabold tracking-tight">
              TalentRank
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Explainable resume screening and candidate ranking. MIT licensed.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Features', href: '#features' },
              { label: 'How it works', href: '#how-it-works' },
              { label: 'Sign in', to: '/login' },
              { label: 'Get started', to: '/login?mode=register' },
            ]}
          />

          <FooterColumn
            title="Resources"
            links={[
              { label: 'GitHub repository', href: GITHUB_URL, external: true },
              { label: 'API documentation', href: API_DOCS_URL, external: true },
            ]}
          />

          <FooterColumn
            title="Legal"
            links={[
              { label: 'Terms of Service', to: '/terms' },
              { label: 'Privacy Policy', to: '/privacy' },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} TalentRank, by Animesh.</p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Github className="size-3.5" aria-hidden="true" />
            Source on GitHub
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
