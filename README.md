# TalentRank — Explainable Resume Screening

[![CI](https://github.com/animesh8787/TalentRank/actions/workflows/ci.yml/badge.svg)](https://github.com/animesh8787/TalentRank/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/frontend-live-brightgreen)](https://frontend-lake-phi-56.vercel.app)
[![API status](https://img.shields.io/badge/API-live-brightgreen)](https://talentrank-api.onrender.com/api/health)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](backend)
[![Frontend](https://img.shields.io/badge/frontend-React_19-61DAFB?logo=react&logoColor=black)](frontend)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](frontend)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](backend)

Rank applicants against a role in seconds, and see exactly which skills, experience
and resume evidence produced every score.

Originally an academic NLP project, rebuilt as a working product: a FastAPI backend
with semantic matching and a React front end.

**[Try it live →](https://frontend-lake-phi-56.vercel.app)** — the frontend is on Vercel and
the API on Render's free tier, so the first request after 15 idle minutes can take 30-60s to
wake the API. Register an account and rank a resume in under a minute. The demo's data lives
in whatever database `DATABASE_URL` points at; on Render's default SQLite it resets on every
deploy (see [Live deployment](#live-deployment)).

---

## Quick start

Sign-in is Firebase Authentication — the app authenticates real people, not
seeded passwords, so a Firebase project is required even for local dev. It's
free and takes a couple of minutes:

**0. Firebase project (one-time)**

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication > Sign-in method** — enable **Email/Password**
3. **Project settings > General > Your apps** — add a web app, copy the config
4. **Project settings > Service accounts** — click **Generate new private key**,
   save the downloaded file as `backend/firebase-service-account.json`
   (already gitignored — it's a secret, never commit it)

**1. Backend**

```bash
cd backend && pip install -r requirements.txt
```

Optional: run the embedding model locally instead of through the Hugging Face API
(`pip install -r requirements-ml.txt`, pulls in torch), and run the tests with
`pip install -r requirements-dev.txt && python -m pytest`.

```bash
cd backend && python -m app.seed
```

```bash
cd backend && python -m uvicorn app.main:app --reload --port 8000
```

**2. Frontend**

```bash
cd frontend && npm install
```

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the four
`VITE_FIREBASE_*` values from step 0.3 above.

```bash
cd frontend && npm run dev
```

Open http://localhost:5173, click **Register**, and create your account — pick
"Recruiter" and either start a new team or join one with an invite code (see
[Teams and privacy](#teams-and-privacy)). To make that account a platform admin:

```bash
cd backend && python -m app.promote_admin you@example.com
```

The seed script creates a "Demo team" organisation with three roles and ingests
the six synthetic resumes in `backend/samples/resumes/`, scoring every pairing. It
prints the team's invite code so a recruiter you register can join it. Real resumes
contain personal data and are never committed; skip the samples and upload your own
through the UI with:

```bash
cd backend && python -m app.seed --no-resumes
```

API docs are at http://localhost:8000/docs.

---

## How scoring works

Every candidate–role pair is scored on seven dimensions, each in `[0, 1]`, combined
with per-role weights that are normalised to sum to 1.0. The defaults live in
`backend/app/services/scoring.py` and are editable per role:

| Dimension | Default weight | What it measures |
|---|---|---|
| **Skills** | 0.30 | Required skills the resume evidences: exact matches plus embedding-based matches |
| **Experience** | 0.20 | Years against the role minimum; log-scaled below it, so 4 of 5 years scores 0.85 rather than 0.80 |
| **Education** | 0.10 | Highest qualification against the minimum, on an ordinal scale |
| **Relevance** | 0.15 | Cosine similarity between the resume and the job description |
| **Location** | 0.10 | Same city or metro; automatically 1.0 for remote roles |
| **Projects** | 0.10 | How many required skills the candidate's listed projects actually use, blended with how many projects are listed |
| **Certifications** | 0.05 | Presence of certifications; full credit at two |

Projects and certifications are read from the resume's own PROJECTS and CERTIFICATIONS
sections, so they only score when the resume has such a section the parser can read.
The defaults are a judgement call, not a validated model: tune them per role.

Every dimension returns a reason, not just a number, so the UI can answer *"why is
this person ranked third?"*: with a radar chart, a weighted breakdown, matched vs
missing skill chips, and the actual resume sentences that evidenced each match.

**Matching backend.** `/api/health` and the header badge always show which one is live:

1. **Hugging Face Inference API** when `HF_TOKEN` is set. Semantic matching with no torch
   on the server, which is what lets it run on a 512 MB free-tier host.
2. **Local sentence-transformers** (`all-MiniLM-L6-v2`) if you `pip install -r
   backend/requirements-ml.txt`. Same model, so vectors from 1 and 2 are interchangeable.
3. **TF-IDF** fitted once over the whole corpus when neither is available (or
   `EMBEDDINGS_ENABLED=false`). Scores stay comparable across candidates, but matching is
   lexical: "Amazon Web Services" will not match "AWS".

Synonyms and spelling variants are matched by the embedding model, not a keyword list.
The only hand-written table is `SKILL_ALIASES` in `taxonomy.py`: about ten short
abbreviations (`js`, `ts`, `k8s`, `golang`, `.net`...) that small embedding models handle
poorly, which also keeps exact-match candidate filters working. Skills are *extracted*
from resumes against a curated taxonomy of ~150 skills, so a skill outside it is not
detected at all.

---

## Features

**For recruiters**
- Ranked candidate table with per-dimension bars and sortable columns
- Explainability drawer: radar chart, weighted breakdown, skill chips, resume evidence
- Live weight tuning — drag a slider, see the ranking reorder instantly with ▲▼ deltas; nothing is saved until you apply
- Kanban pipeline (New → Shortlisted → Interviewing → Offer → Hired / Rejected) with drag-and-drop *and* a keyboard-accessible menu on every card
- Side-by-side comparison of 2–3 candidates with an overlaid radar and skill matrix
- Filters and full-text search; CSV shortlist export
- Notes and 1–5 star ratings per candidate
- Duplicate detection by email, phone or resume content hash (within your team)
- In-app resume viewer for the original PDF/TXT (Word files offer a download)
- Analytics: score distribution, experience spread, skill supply gap, pipeline funnel
- Audit log of every change, including notes and upload retries
- Teams: invite teammates with a code; everything is private to your team

**Bias-reduced review.** Blind review is a setting on each **role**, enforced by the
server: for a blind role, every response that carries its candidates (rankings, detail,
compare, stage changes, CSV export, the candidate list, the resume file, upload progress
events) hides names, contact details, universities, locations, the resume's file name and
any occurrence of the candidate's name inside the resume text, replacing each person with a
stable alias (*Swift Falcon #4821*). The audit log never records candidate names, and
name search is disabled for blind candidates so it cannot be used to confirm an identity.
Skills, experience, scores and evidence survive, because those are what the reviewer is
meant to judge. A reviewer can also switch on a personal blind toggle in the header; it can
only add redaction, never remove it. Redaction removes the identifiers the parser finds
(name, email, phone, links, institutions, demographic terms); free text can still contain
other identifying details.

**For candidates**
- Drag-and-drop upload with live per-file progress over SSE
- See exactly what was extracted, and correct anything wrong — corrections are what
  recruiters then match against
- Resume health check: eight scored checks (machine-readable, contact details,
  skills, experience, education, standard sections, length, links), each with a
  concrete fix

---

## Architecture

```
frontend/                      React 19 · Vite · TypeScript · Tailwind · Radix
  src/components/ui/           shadcn-style primitives
  src/components/app/          Drawer, kanban, compare, weight sliders, palette
  src/pages/                   One file per route
  src/lib/api.ts               Typed API client
  src/hooks/                   Auth, theme, blind review, SSE stream

backend/
  app/models.py                Single SQLAlchemy 2.0 schema
  app/schemas.py               Pydantic request/response models
  app/core/                    Config, database, Firebase token verification, schema self-heal + org backfill
  app/promote_admin.py         CLI: promote a registered user to admin
  app/services/
    taxonomy.py                Skills, aliases, regex patterns, gazetteers
    extraction.py              PDF/DOCX → text (pypdf, python-docx)
    parsing.py                 Text → structured fields
    embeddings.py              HF Inference API / local sentence-transformers / TF-IDF
    scoring.py                 The seven-dimension explainable scorer
    tenancy.py                 Organisation scoping: who may see which row
    ranking.py                 Persisting and re-scoring matches
    health_check.py            Resume health report
    anonymize.py               Server-side redaction for blind review
    pipeline.py                Ingestion queue + SSE event bus
  app/api/routes/              auth · orgs · jobs · candidates · uploads · matches · analytics
  samples/                     Synthetic resumes + ground truth (python -m app.eval_parsing)
  tests/                       pytest: scoring, anonymisation, tenancy, CSV escaping, ingestion
```

**Ingestion pipeline.** Upload → queued → extract → parse → embed → score against
every role the candidate is eligible for, on two background worker threads, with each state
change broadcast over server-sent events to the people allowed to see it. Scoring runs once
per affected role per batch rather than once per file. The queue lives in memory, so on
startup the app re-queues any upload a restart interrupted. This is a single-process design:
running several API instances would need a real job queue.

---

## Teams and privacy

* **Organisations.** Registering as a recruiter creates an organisation (or joins one with
  an invite code from a teammate's **Team** page; codes can be replaced at any time).
  Jobs, uploads, notes, exports and the audit log are visible only inside the organisation.
* **Who sees which candidate.** A recruiter sees a candidate only if their organisation
  uploaded them, **or** the candidate registered themselves (the talent pool) **and** matches
  one of the organisation's *active* roles. Candidate sign-up states this. Pool candidates are
  read-only for recruiters. Two teams uploading the same resume get two separate records.
* **Admins** are platform-wide (promote with `python -m app.promote_admin`).
* **Existing installs.** On first start after upgrading, every existing recruiter is moved
  into a personal organisation, their jobs and uploaded candidates follow them, and anything
  with no recoverable owner goes to the oldest organisation (never into the open pool).
  Recruiters who should share data must then be moved into one organisation by hand, or
  re-join with an invite code.

---

## Configuration

Everything is optional — copy `backend/.env.example` to `backend/.env` to change it.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./storage/talentrank.db` | Any SQLAlchemy URL. Postgres driver (`psycopg2-binary`) is bundled — just set `postgresql://user:pass@host/dbname`. For MySQL: `pip install PyMySQL` then `mysql+pymysql://user:pass@localhost:3306/resume_db` |
| `FIREBASE_CREDENTIALS_FILE` | `./firebase-service-account.json` | Service account key for verifying sign-ins — see Quick start, step 0 |
| `HF_TOKEN` | unset | Hugging Face read token. Enables semantic matching through the Inference API, no torch needed |
| `EMBEDDINGS_ENABLED` | `true` | `false` forces the offline TF-IDF path |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Any sentence-embedding model (HF API or local) |
| `STORAGE_DIR` | `./storage/resumes` | Where uploaded files are written |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Comma-separated |

The frontend reads `VITE_API_URL` (the backend's base URL — leave unset locally;
Vite's proxy handles `/api`) plus four `VITE_FIREBASE_*` values from the Firebase
web app config (public, safe to embed in the bundle — see `frontend/.env.example`).

---

## Live deployment

The frontend is static and deploys anywhere; the backend needs a real server — it
keeps a SQLite file, runs background worker threads, and streams upload progress
over SSE, none of which fit a serverless function. Two free-tier services cover both:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/animesh8787/TalentRank)

**1. Backend (Render).** Click the button above — it reads [`render.yaml`](render.yaml)
and creates the API under *your own* Render account (sign-up is Render's, not
something I can do on your behalf). It'll prompt for env vars marked `sync: false`:
- `DATABASE_URL` — a hosted Postgres URL (e.g. [Neon](https://neon.tech) or
  [Supabase](https://supabase.com), both free). **Do not leave this as SQLite on
  Render:** the free disk is wiped on every deploy, taking every account, job and
  candidate with it. The Postgres driver is already bundled.
- `HF_TOKEN` — a Hugging Face read token for semantic matching without torch. Optional:
  without it the API uses the TF-IDF matcher.
- `FIREBASE_CREDENTIALS_JSON` — paste the full contents of your service-account key
  (Render's blueprint can set env vars but not provision a secret file)
- `CORS_ORIGINS` — your Vercel domain (from step 2 below)

Free-tier trade-offs: a cold start of ~30-60s after 15 minutes idle, 512 MB RAM (hence no
torch in `requirements.txt`), and uploaded resume *files* still live on the ephemeral disk
even with Postgres, so the in-app viewer and "retry" lose them on redeploy (parsed data
stays in the database).

**2. Frontend (Vercel).** https://frontend-lake-phi-56.vercel.app is a static build. Set
`VITE_API_URL=<your Render URL>` plus the four `VITE_FIREBASE_*` values (same as
`frontend/.env.example`) in the Vercel project's settings, then redeploy (`vercel --prod`
from `frontend/`, or from the dashboard). Finally, on Render, set `CORS_ORIGINS` to your
Vercel domain and restart the service.

---

## Notes and limits

- **Parsing is rule-based, not perfect.** It reads names, contact details, skills,
  experience, education, projects and certifications with regexes over a curated taxonomy.
  `python -m app.eval_parsing` checks it against the six synthetic resumes in
  `backend/samples/` (all checks pass), but those were written alongside the parser, so that
  is a regression check, not an accuracy figure; there is no measured accuracy on real
  resumes. Unusual layouts (multi-column, heavy tables) still produce odd names, and
  projects stacked directly under each other with no blank line or separator can merge.
  That is why candidates can correct their own parsed data.
- **Scanned PDFs are rejected, not silently mis-ranked.** A PDF with under 40 words of
  selectable text per page fails with an explicit "needs OCR" message rather than scoring 0.
  There is no OCR; export a text-based PDF or upload a DOCX.
- **No spaCy, no NLTK.** Extraction is plain regex over a curated taxonomy, and meaning-level
  matching comes from sentence embeddings (see above).
- **Authentication is Firebase, not a hand-rolled JWT.** The backend never sees a
  password — it only verifies ID tokens the frontend gets from Firebase. Your own
  `User`/`Candidate`/role model is unaffected; Firebase only replaces the login box.
- **No migration framework — the app heals its own schema on startup.** There has
  never been an Alembic (or similar) setup here, so `app.core.migrations.sync_schema`
  runs on every startup instead: it creates any table that doesn't exist yet (what
  `Base.metadata.create_all` already did), then adds any column that's on a model but
  missing from an existing table, backfilling it for existing rows from that column's
  default. This only ever adds columns — never renames, drops or changes one — which
  is all a schema change here has needed so far. If a future change needs more than
  that (a rename, a drop, backfilling a computed value, a non-nullable column on a
  populated table), that's the point to bring in a real migration tool instead.

## Credits

Original project by Ayush. Rebuilt with an explainable scoring engine and a new
front end.
