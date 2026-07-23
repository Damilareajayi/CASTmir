# PRISM — Architecture

PRISM is an AI Performance Intelligence System: it monitors AI tool usage across an
institution, detects when quality degrades, classifies *why*, and surfaces both the
raw data and a plain-English report. It ships as two independent pieces — a React
frontend and a small Express/SQLite backend — that talk over a plain REST API.

```
┌─────────────────────────┐        HTTP (VITE_API_URL)        ┌──────────────────────────┐
│  Frontend (Vite/React)  │ ───────────────────────────────▶ │  Backend (Express)       │
│  localhost:5173         │ ◀─────────────────────────────── │  localhost:8000          │
│                         │           JSON                    │                          │
│  Landing.jsx            │                                    │  server.js (routes)      │
│  Dashboard.jsx          │                                    │  aggregate.js (queries)  │
│  agents.js  (Agent 1-4  │                                    │  scoring.js (PMI/CUSUM)  │
│    logic, client copy)  │                                    │  db.js (SQLite)          │
│  report.js  (Agent 4    │                                    │  ingest.js / seed.js     │
│    narrative + PDF)     │                                    │    (data population)     │
│  mockData.js (fallback) │                                    │                          │
└─────────────────────────┘                                    └──────────────────────────┘
```

If `VITE_API_URL` is unset, the frontend falls back to `mockData.js` (synthetic,
in-browser, no network) — so the UI always works even with the backend off.

## Frontend — `src/`

| File | Role |
|---|---|
| `main.jsx`, `Root.jsx` | Entry point + hash-based router (`#dashboard` vs landing). No react-router — just `window.location.hash`. |
| `Landing.jsx` | Marketing/landing page: hero, stats, RECAST callout, problem statement, four-agent explainer, research framework, use cases, about, CTA, footer. |
| `Dashboard.jsx` | The actual product: tabbed dashboard (Overview / Models / Agents / Alerts / COACH / Reports), college/department/time-range filters, live-updating ticker. |
| `UI.jsx` | Shared presentational components (`Card`, `KPI`, `Table`, `Pill`, `PrismBar`, `ChartTip`, `useVisible` scroll-reveal hook, `Counter`). |
| `constants.js` | Brand colors, the 8 tracked AI models, all 17 FSU colleges + departments, the 4-agent definitions used on the landing page. |
| `mockData.js` | Deterministic seeded-random data generator — used when no backend is configured. Same shapes as the real API. |
| `agents.js` | Client-side implementations of Agent 1 (scoring/PMI), Agent 2 (CUSUM drift detection), Agent 3 (COACH — calls `/api/coach` via the Vite dev-server proxy to an LLM provider), Agent 4 (CSV/JSON export helpers). |
| `report.js` | Turns dashboard data into a plain-English narrative (executive or detailed), with PDF (jsPDF) and Markdown/text export. |

**The "4 agents" concept** (Performance Monitor, Degradation Diagnostician, COACH,
Reporting Engine) is the product's whole framing — see `AGENT_DEFS` in
`constants.js` for the narrative, and `agents.js` / `report.js` / `backend/scoring.js`
for the actual math behind Agents 1, 2, and 4. Agent 3 (COACH) is the only one that
calls a real LLM.

### COACH (Agent 3) and AWS Bedrock

`vite.config.js` adds a dev-server middleware at `/api/coach` that calls AWS
Bedrock's Converse API (`@aws-sdk/client-bedrock-runtime`) using whatever AWS
credentials are resolvable on the machine running the dev server (the SDK's
default credential chain — `aws configure`, `aws login`, an instance role,
etc.). No API key lives in `.env`; nothing AWS-related reaches the browser.
The model defaults to `us.anthropic.claude-haiku-4-5-20251001-v1:0` and is
overridable via `BEDROCK_MODEL_ID`. Without valid credentials or Bedrock
model access, the COACH tab shows a clear setup error instead of failing
silently.

## Backend — `backend/`

Plain Node (no framework beyond Express), using `node:sqlite` (built-in, no native
build step) so it runs on this machine without Python or a C++ toolchain.

| File | Role |
|---|---|
| `ingest.js` | One-time pull of real human prompts from `OpenAssistant/oasst1` (ungated, public) via HuggingFace's `datasets-server` REST API. Stores raw English `prompter` messages in `raw_prompts`. |
| `seed.js` | Combines real prompt text with *synthetic* institutional metadata (college, department, model, date) across a 90-day window, computing real PMI/quality scores per session via `scoring.js`. Writes to the `sessions` table. |
| `scoring.js` | Ported from `src/agents.js` — `computePMI`, `scoreSession`, CUSUM (`runCUSUM`), and three-way drift classification (`detectDrift`). Runs against real text, not canned numbers. |
| `aggregate.js` | SQL aggregation queries that reshape `sessions` rows into exactly the JSON shapes the frontend expects (summary KPIs, trends, college/model comparisons, drift events/distribution, PMI distribution). |
| `server.js` | Express routes (`/api/summary`, `/api/accuracy/trends`, `/api/sessions/volume`, `/api/accuracy/by-college`, `/api/models/comparison`, `/api/drift/distribution`, `/api/drift/events`, `/api/alerts`, `/api/pmi/distribution`) with CORS enabled for the Vite dev server. |
| `db.js` | Opens `backend/data/prism.db` and creates the `raw_prompts` / `sessions` schema if missing. |
| `constants.js` | Backend-side copy of the model list + FSU college/department structure (kept in sync with `src/constants.js`). |

**Data honesty note:** accuracy/PMI numbers are *real* computations over *real* human
prompt text — but which college, department, model, and date each prompt is
attributed to is synthetic (FSU has not granted real usage data yet). This is
documented in the KPI payload's `data_source` field and is the intended design
until a real institutional data-sharing agreement is in place.

## Running it

```bash
# Backend (one-time data setup, then serve)
cd backend
npm install
npm run ingest   # pulls ~1-3k real prompts from oasst1
npm run seed     # builds the 90-day sessions table
npm run start    # serves on :8000

# Frontend
cd ..
npm install
echo "VITE_API_URL=http://localhost:8000" >> .env   # omit to use mock data instead
npm run dev      # serves on :5173
```

## Assets

`public/*.png` are the FSU-branded mascot images, background-removed (flood-fill
script, not checked in) and cropped. `public/mascot-head.png` is a head-only crop
used everywhere a small square logo is needed (nav, footer, favicon); full-body
cutouts are used for illustrative placements (hero, about, CTA). Untouched
originals are kept in `assets-original/` (not served). `public/recast-logo.png` is
the RECAST Team's own logo, used in the dedicated RECAST section on the landing
page.

## Known gaps / next steps

- Backend has no auth — fine for local dev, not for a real deployment.
- `avg_pmi` is nearly identical across all models in the seeded data, because
  session prompts are drawn from the same real-prompt pool regardless of assigned
  model — a known artifact of the synthetic-metadata approach, not a bug.
- COACH (Agent 3) genuinely calls AWS Bedrock now. The rest of the landing page's
  production architecture claims (BigQuery, Bedrock Agents, Cloud Run for Agents
  1/2/4) are still aspirational — the current backend is a local stand-in with the
  same API shape, not the real cloud pipeline.
- The Bedrock call currently runs from the Vite dev-server process using
  developer-local AWS credentials. A real deployment would move this to a proper
  backend route (e.g. `backend/server.js`) running under an IAM role instead of
  a developer's CLI session.
