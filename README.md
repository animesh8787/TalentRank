# TalentRank — Explainable Resume Screening

[![CI](https://github.com/animesh8787/TalentRank/actions/workflows/ci.yml/badge.svg)](https://github.com/animesh8787/TalentRank/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/frontend-live-brightgreen)](https://frontend-lake-phi-56.vercel.app)
[![API status](https://img.shields.io/badge/API-not_deployed_yet-lightgrey)](#live-deployment)
[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](backend)
[![Frontend](https://img.shields.io/badge/frontend-React_19-61DAFB?logo=react&logoColor=black)](frontend)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](frontend)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](backend)

Rank applicants against a role in seconds, and see exactly which skills, experience
and resume evidence produced every score.

Originally an academic NLP project, rebuilt as a working product: a FastAPI backend
with semantic matching and a React front end.

**[Live frontend →](https://frontend-lake-phi-56.vercel.app)** (sign-in won't work until
the backend below is deployed too — see [Live deployment](#live-deployment))

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
"Recruiter" to see the full dashboard. To make that account an admin:

```bash
cd backend && python -m app.promote_admin you@example.com
```

The seed script creates three roles and ingests any resumes found in
`src/components/datafiles/Input_files/sample resume/`, scoring every pairing.
**That folder is gitignored** — resumes contain real names, emails and phone
numbers, so they are not published with the repository. Drop your own PDFs or
DOCX files there before seeding, or skip it and upload through the UI:

```bash
cd backend && python -m app.seed --no-resumes
```

API docs are at http://localhost:8000/docs.

---

## How scoring works

Every candidate–role pair is scored on five dimensions, each in `[0, 1]`, combined
with per-role weights that are normalised to sum to 1.0:

| Dimension | Default weight | What it measures |
|---|---|---|
| **Skills** | 0.35 | Required skills the resume evidences — exact matches plus embedding-based matches, so "ML" counts for "machine learning" |
| **Experience** | 0.25 | Years against the role minimum; log-scaled below it, so 4 of 5 years scores 0.86 rather than 0.80 |
| **Education** | 0.15 | Highest qualification against the minimum, on an ordinal scale |
| **Relevance** | 0.15 | Cosine similarity between the resume and the job description |
| **Location** | 0.10 | Same city or metro; automatically 1.0 for remote roles |

Every dimension returns a reason, not just a number, so the UI can answer *"why is
this person ranked third?"* — with a radar chart, a weighted breakdown, matched vs
missing skill chips, and the actual resume sentences that evidenced each match.

**Matching backend.** Semantic matching uses `sentence-transformers/all-MiniLM-L6-v2`
(~90 MB, downloaded once on first run). If it can't be loaded — no network, or
`EMBEDDINGS_ENABLED=false` — the app falls back to TF-IDF fitted **once over the whole
corpus**, so scores stay comparable across candidates. The header badge always shows
which backend is live.

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
- Duplicate detection by email, phone or resume content hash
- Analytics: score distribution, experience spread, skill supply gap, pipeline funnel
- Audit log of every change

**Bias-reduced review.** A "blind review" toggle hides names, contact details,
universities and locations, replacing each candidate with a stable alias
(*Swift Falcon #4821*). Redaction happens **server-side** — hiding fields in the
browser would still ship the real values over the wire. Skills, experience, scores
and evidence all survive, because those are what the reviewer is meant to judge.

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
  app/core/                    Config, database, Firebase token verification
  app/promote_admin.py         CLI: promote a registered user to admin
  app/services/
    taxonomy.py                Skills, aliases, regex patterns, gazetteers
    extraction.py              PDF/DOCX → text (pypdf, python-docx)
    parsing.py                 Text → structured fields
    embeddings.py              Sentence transformers + TF-IDF fallback
    scoring.py                 The five-dimension explainable scorer
    ranking.py                 Persisting and re-scoring matches
    health_check.py            Resume health report
    anonymize.py               Server-side redaction for blind review
    pipeline.py                Ingestion queue + SSE event bus
  app/api/routes/              auth · jobs · candidates · uploads · matches · analytics
```

**Ingestion pipeline.** Upload → queued → extract → parse → embed → score against
every open role, on background worker threads, with each state change broadcast to
subscribed browsers over server-sent events.

---

## Configuration

Everything is optional — copy `backend/.env.example` to `backend/.env` to change it.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./storage/talentrank.db` | Any SQLAlchemy URL. For MySQL: `pip install PyMySQL` then `mysql+pymysql://user:pass@localhost:3306/resume_db` |
| `FIREBASE_CREDENTIALS_FILE` | `./firebase-service-account.json` | Service account key for verifying sign-ins — see Quick start, step 0 |
| `EMBEDDINGS_ENABLED` | `true` | `false` forces the offline TF-IDF path |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Any sentence-transformers model |
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
something I can do on your behalf). It'll prompt for two env vars marked `sync: false`
in the blueprint:
- `FIREBASE_CREDENTIALS_JSON` — paste the full contents of your service-account key
  (Render's blueprint can set env vars but not provision a secret file, so this is
  the same JSON `backend/.env.example` points at locally, just inlined)
- `CORS_ORIGINS` — your Vercel domain (from step 2 below)

Free-tier trade-offs, so the demo actually works within 512MB RAM:
`EMBEDDINGS_ENABLED=false` (keyword/TF-IDF matching instead of the
sentence-transformer), a cold start of ~30-60s after 15 minutes idle, and an
ephemeral disk — SQLite data resets on redeploy. For persistent data, point
`DATABASE_URL` at a free hosted Postgres (e.g. [Neon](https://neon.tech) or
[Supabase](https://supabase.com)) instead.

**2. Frontend (Vercel).** Already deployed: https://frontend-lake-phi-56.vercel.app.
It's a static build with no backend wired up yet, so every API call fails until step 1
is done. In the Vercel project's settings, add `VITE_API_URL=<your Render URL>` plus
the four `VITE_FIREBASE_*` values (same as `frontend/.env.example`), then redeploy
(`vercel --prod` from `frontend/`, or trigger it from the dashboard). Finally, back on
Render, set `CORS_ORIGINS` to your Vercel domain and restart the service.

---

## Notes and limits

- **Parsing is rule-based, not perfect.** Across the 31 resumes it was developed
  against, it extracted a usable name for 29 and a location for 25. Unusual layouts
  (multi-column, heavy tables) still produce odd names. That is exactly why
  candidates can correct their own parsed data.
- **Scanned PDFs are rejected, not silently mis-ranked.** They fail with an explicit
  "needs OCR" message rather than scoring 0.
- **No spaCy.** The original code called `spacy.load('en_core_web_lg')` in five
  places for entity extraction that barely fed the score. Rule-based extraction over
  a curated taxonomy plus sentence embeddings does better here without a 560 MB
  model download.
- **Authentication is Firebase, not a hand-rolled JWT.** The backend never sees a
  password — it only verifies ID tokens the frontend gets from Firebase. Your own
  `User`/`Candidate`/role model is unaffected; Firebase only replaces the login box.
- The original Streamlit apps and the `preprocessing/` package are left in place for
  reference; nothing in `backend/` or `frontend/` depends on them.

## Credits

Original project by Ayush. Rebuilt with an explainable scoring engine and a new
front end.
