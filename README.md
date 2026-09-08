# CASTmir — AI Performance and Security Monitor

A browser extension + web platform that watches how people actually use AI
tools (ChatGPT, Claude, Gemini, Copilot, Perplexity) in real time — scores
prompt quality and maturity, coaches weaker prompts toward better ones,
flags security risks like prompt injection as they happen, and gives both
the individual and a research admin their own private view into the data.

Built by the RECAST Team, FSU Innovation Hub.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how the pieces fit together
and why specific decisions were made.

## What's here

- **`extension/`** — Manifest V3 browser extension. Per-site consent (a
  native permission prompt plus an explicit research-consent screen before
  anything is captured), an inline Grammarly-style COACH widget that
  nudges weak prompts as you type, and a toolbar badge that signals
  security alerts or drift in real time.
- **`backend-py/`** — FastAPI + DuckDB backend. Four agents (Performance
  Monitor, Diagnostician, COACH, Reporter) plus a two-track security layer
  (a behavioral ML classifier and an independent LLM content classifier),
  S3-backed DuckDB persistence, and a remote-configurable selector system
  so a broken site selector ships as a one-line admin fix instead of a new
  extension release.
- **`frontend/`** — React dashboards (Recharts), auto-refreshing in real
  time: a private per-person view and an aggregate, alias-grouped admin
  research view, both with PDF/PPTX/HTML/CSV/JSON report export.
- **`training/`** — the security classifier's training pipeline (real
  behavioral features extracted from LMSYS-Chat-1M and a leaked ransomware
  chat log, used as the normal/attack classes).

### Feature highlights

- **Real prompt/response capture**, not just structural proxies — PMI
  (Prompt Maturity Index, 1-5) and a 0-100 quality score are computed
  directly from the actual text.
- **COACH** rewrites weak prompts in place, tailored to the destination
  tool's actual strengths, grounded in the user's own real conversation
  history (never generic `[placeholder]` brackets), and deliberately
  restrained on prompts that don't need elaborating.
- **Two independent security detection paths** running on every turn — a
  behavioral classifier (timing/length/counts only) and a content-based
  LLM classifier (reads the actual text) — because either one alone misses
  attacks the other catches. Every high-severity alert carries a
  plain-English justification, not just a label.
- **Generic fallback input detection** — the same technique Grammarly
  uses (HTML's own `<textarea>`/`contenteditable`/`role="textbox"`
  semantics) kicks in automatically if a site's specific selector breaks,
  so capture keeps working while the real fix ships.
- **Timezone-aware reporting** — every trend, chart, and report groups by
  each person's own local calendar day, not a single global UTC day.
- **Real-time dashboards** — both dashboards silently refresh every 20
  seconds; a visible "Live" indicator confirms it rather than leaving you
  guessing whether the page is stuck.
- **Research-grade export** — Daily/Weekly/custom-range executive or
  detailed reports as PDF, PPTX (admin, with native charts), HTML, or
  Markdown; raw CSV/JSON exports; a dedicated OCSF JSON export of security
  findings for SIEM ingestion.

## Local development

### Extension

Not published to the Chrome Web Store yet. Load it unpacked:

```
chrome://extensions → Developer mode → Load unpacked → select extension/
```

See `extension/INSTALL.md` for the full walkthrough (also what ships
inside the zip the `/#install` page serves to pilot participants).

### Backend (`backend-py/`)

```bash
cd backend-py
python -m venv .venv && .venv\Scripts\activate   # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # every value has a working default — fill in only what you need to override
uvicorn main:app --reload --port 8080
```

COACH and the content-based security classifier both call AWS Bedrock via
`boto3` — no API key in `.env`; configure AWS credentials on the machine
once (`aws configure` or `aws login`), with Bedrock model access enabled
for an Anthropic model in the configured region (`AWS_REGION`, defaults
`us-east-1`; model via `BEDROCK_MODEL_ID`, defaults to
`us.anthropic.claude-haiku-4-5-20251001-v1:0`).

DuckDB persists to `backend-py/data/castmir.duckdb` locally. In
production it's backed up to and restored from S3 on an interval (see
ARCHITECTURE.md) — set `S3_BACKUP_BUCKET` to opt into that locally too,
or leave it unset for a plain local file.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies to the backend
```

Set `VITE_API_URL` (or `'SAME_ORIGIN'` for the production same-origin
setup the Docker image uses) in `frontend/.env` if not pointing at the
default deployed backend.

## Deployment

Single AWS App Runner service (`castmir-api`), single Docker image
(`backend-py/Dockerfile`, multi-stage — builds `frontend/`, regenerates
the extension's install zip fresh from `extension/` on every build, then
copies both into the Python image, which serves the API and the static
frontend from one origin). See ARCHITECTURE.md's Deployment section for
the actual build/deploy pipeline (CodeBuild + ECR + App Runner, no local
Docker required).

## Tech stack

Extension: vanilla JS, Manifest V3, `webextension-polyfill`.
Backend: Python 3.12, FastAPI, DuckDB, boto3 (AWS Bedrock), scikit-learn
(security classifier). Frontend: React 18, Vite 5, Recharts, jsPDF,
pptxgenjs. Deployed on AWS App Runner, built via CodeBuild, images in ECR.

## Older code in this repo

`backend/`, `src/`, and root-level `index.html`/`package.json` are the
original PRISM-era Node/Express + single-dashboard React app — a
different, earlier project this repo evolved from. Not part of the
current system; do not add features there. See ARCHITECTURE.md.
