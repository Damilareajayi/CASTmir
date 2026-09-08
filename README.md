# CASTmir — AI Performance Intelligence

Track, diagnose, and correct AI model degradation across an institution.

CASTmir monitors AI tool usage (ChatGPT, Gemini, Copilot, and others), scores
output quality over time, statistically detects when it degrades, classifies
*why* (model drift, prompt drift, or context drift), and closes the loop with
an AI-powered prompt coach and plain-English reporting.

Built by the RECAST Team, FSU Innovation Hub — funded by the ReliaQuest
Innovation Challenge Fund.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how the pieces fit together.

## What's here

- **Landing page** — product overview, the four-agent framework, research
  grounding (Self-Directed Learning theory), and use cases.
- **Dashboard** — Overview / Models / Agents / Alerts / COACH / Reports tabs,
  filterable by college, department, and time range (7/30/90 days).
- **Drift detection** — CUSUM-based statistical process control classifies
  degradation into Model Drift, Prompt Drift, or Context Drift.
- **COACH** — an LLM rewrites weak prompts and explains the improvement.
- **Reports** — plain-English executive or detailed reports, downloadable as
  PDF or Markdown, generated live from whatever's on screen.
- **Backend** — a small Express/SQLite API seeded from real human prompts
  (OpenAssistant/oasst1) with synthetic institutional metadata layered on top,
  so the frontend can run against real computed data instead of pure mocks.

## Quick start

Works with just the frontend (uses built-in mock data), or frontend + backend
for real computed data.

### Frontend only

```bash
npm install
npm run dev        # http://localhost:5173
```

### Frontend + backend

```bash
# 1. Backend — one-time data setup, then serve
cd backend
npm install
npm run ingest      # pulls real prompts from OpenAssistant/oasst1
npm run seed         # builds a 90-day sessions table from them
npm run start         # serves the API on :8000

# 2. Frontend — point it at the backend
cd ..
npm install
cp .env.example .env
echo "VITE_API_URL=http://localhost:8000" >> .env
npm run dev            # http://localhost:5173
```

### Enabling COACH (Agent 3)

COACH rewrites prompts via AWS Bedrock behind a server-side proxy — nothing
AWS-related reaches the browser. No API key goes in `.env`; instead, configure
AWS credentials on this machine once:

```bash
aws configure     # or: aws login
```

The account needs Bedrock model access enabled for an Anthropic model in the
configured Region (defaults to `us-east-1`, model defaults to
`us.anthropic.claude-haiku-4-5-20251001-v1:0` — override with
`BEDROCK_MODEL_ID` in `.env` if needed).

Without valid credentials, the COACH tab still renders and explains what to
set up — it just won't return a rewrite.

## Scripts

| Location | Command | Does |
|---|---|---|
| root | `npm run dev` | Start the Vite dev server |
| root | `npm run build` | Production build to `dist/` |
| root | `npm run preview` | Preview the production build |
| `backend/` | `npm run ingest` | Pull real prompts from OpenAssistant/oasst1 |
| `backend/` | `npm run seed` | Populate the SQLite `sessions` table |
| `backend/` | `npm run start` | Serve the API on port 8000 |

## Tech stack

React 18 · Vite 5 · Recharts · Express · Node's built-in `node:sqlite` (no
native build step) · jsPDF for report export · AWS Bedrock (`@aws-sdk/client-bedrock-runtime`) for COACH.

## Data honesty

Accuracy and prompt-maturity numbers are computed for real from real human
prompt text. Which college, department, model, and date each session is
attributed to is synthetic — FSU has not yet granted access to real
institutional usage data. See `data_source` in the API's summary response, and
the "Data honesty" note in [ARCHITECTURE.md](ARCHITECTURE.md).
