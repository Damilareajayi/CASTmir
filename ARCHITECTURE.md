# CASTmir — Architecture

CASTmir is a browser extension + web platform that monitors AI tool usage as it
happens: a Chrome extension captures each prompt/response turn on supported AI
sites, a FastAPI/DuckDB backend scores it for quality and security risk, and two
separate dashboards surface the results — a private per-user view and an
anonymized cohort-wide research view.

```
┌────────────────────┐   session events    ┌──────────────────────────┐   reads   ┌────────────────────┐
│  extension/         │ ───────────────────▶│  backend-py/              │◀──────────│  frontend/          │
│  content.js          │   POST /api/session │  FastAPI + DuckDB         │           │  UserDashboard.jsx  │
│  background.js       │                     │  agents/  (1-4)           │           │  AdminDashboard.jsx │
│  popup.html/js        │                    │  security/ (classifier,   │           │  Landing.jsx        │
│                       │                    │    OCSF)                  │           │                     │
└────────────────────┘                      └──────────────────────────┘           └────────────────────┘
                                                        │
                                                        ▼
                                              AWS Bedrock (COACH, Agent 3)
```

All three pieces (`extension/`, `backend-py/`, `frontend/`) are served/deployed
together in production — `backend-py`'s Docker image builds `frontend/` in a
build stage and serves the static output itself (same-origin, no CORS needed
for the frontend's own calls). The extension talks to the deployed backend
over HTTPS from any machine it's installed on.

The original `backend/` (Express/SQLite) and `src/` (old single-dashboard
frontend) directories are the previous architecture, kept only because a
service is still live on the old URL — not part of the current system. Do
not add features there.

## Data flow — one AI turn, start to finish

1. **Capture.** `content.js` watches the DOM on a supported site (ChatGPT,
   Claude, Gemini, Copilot, Perplexity — see `SUPPORTED_SITES` in
   `background.js`). On prompt submit and response completion, it captures
   the prompt text, the response text, and derived structural signals (word
   count, role framing, format/constraint language, example usage).
2. **Consent gate.** Nothing is captured until two separate approvals are
   both true for that site: a per-site browser permission (native prompt,
   requested via a button in the popup — not silently granted at install)
   and a one-time research consent (cohort code + explicit "I consent"
   click). The consent screen discloses, in plain language, that prompt and
   response *content* is captured — see `popup.html`'s `#consent` screen.
   **Enabling CASTmir on a site is what gives consent** — there is no
   separate additional opt-in step for content specifically.
3. **Send.** `background.js` attaches the persistent anonymized `user_hash`
   (generated once at install, stored in `browser.storage.local`) and POSTs
   the event to `/api/session/event`.
4. **Score (Agent 1 — `agents/monitor.py`).** `compute_pmi_from_text()`
   scores prompt maturity (1-5) directly from the real prompt text when
   present (falls back to the structural-signal-only `compute_pmi()` if a
   client ever sends an event without text). `compute_quality()` scores
   0-100 from response depth, turn engagement, PMI, and latency.
5. **Diagnose (Agent 2 — `agents/diagnostician.py` + `security/`).** Two
   tracks, split by problem domain:
   - **Track 1 (performance):** CUSUM drift detection over the user's
     recent quality series, classifying Model/Prompt/Context drift.
   - **Track 2 (security):** two independent detection paths, not one —
     a *behavioral* path (`security/classifier.py`, a RandomForest trained
     by `training/train.py`) scores a 10-feature behavioral vector
     (`security/features.py` — timing/length/counts only, never prompt or
     response text) for threat likelihood, then a rule-based sub-classifier
     assigns a specific type (prompt_injection / mcp_attack / rag_poisoning
     / data_exfiltration / anomaly); and a *content-based* path
     (`security/content_classifier.py`, same Bedrock model as COACH) that
     reads the actual prompt/response text and independently classifies it
     against the same five types. The content-based path exists because
     the behavioral path's signal misses a well-disguised attack with
     ordinary length and timing. `routers/sessions.py` runs both Track 2
     paths on every turn and keeps whichever found the higher-confidence
     match.
6. **Store.** Everything — including `prompt_text` and `response_text` —
   is written to DuckDB's `sessions` table (`data/schema.sql`).
7. **Alert (Agent 3 — `agents/coach.py`).** If either track's threat_score >
   0.65, an OCSF-formatted finding (`security/ocsf.py`, tagged with which
   track caught it) is written to `security_events`, and a template-based
   warning is returned immediately in the API response — the alert itself
   is still template-based either way, never a second Bedrock round trip.
   `background.js` turns that into a `chrome.notifications` popup.
8. **Read (Agent 4 — `agents/reporter.py`).** The two dashboards pull from
   the same tables through two different privacy lenses — see below.

## The two dashboards

- **User dashboard** (`frontend/src/UserDashboard.jsx`, `GET
  /api/user/{user_hash}/dashboard`) — strictly scoped to one `user_hash`.
  Every query in `reporter.user_dashboard()` filters on it explicitly, so
  one user's data can never leak into another's view. Reached by clicking
  the extension's toolbar icon (once a site is authorized and consent
  given, a click opens this directly — see `background.js`'s
  `action.onClicked`) or the popup's "Open full dashboard" button, both of
  which pass `?hash=<user_hash>` in the URL so there's no manual ID entry
  in the normal flow. Manual entry (typing in a CASTmir ID) is a fallback
  for visiting the URL directly, outside the extension.
- **Admin dashboard** (`frontend/src/AdminDashboard.jsx`, `GET
  /api/admin/dashboard`) — aggregate-only, never keyed to an individual
  user. Gated behind a real server-side check: every `/api/admin/*` route
  requires an `X-Admin-Token` header (`deps.py`'s `require_admin`),
  checked against the `ADMIN_TOKEN` environment variable. The token is
  entered once by the admin at runtime and held in `sessionStorage` —
  never baked into the built JS bundle, which anyone can read via
  view-source.

## COACH (Agent 3) and AWS Bedrock

`agents/coach.py`'s `rewrite_prompt()` calls Bedrock's Converse API
(`boto3`) server-side only — nothing AWS-related reaches the browser or the
extension. Model defaults to `us.anthropic.claude-haiku-4-5-20251001-v1:0`
via `BEDROCK_MODEL_ID`. The deployed backend's IAM role
(`prism-apprunner-instance-role`) is scoped to exactly that model ARN.

## Security classifier training — `training/`

- **Attack class**: `extract_features.py` parses `blackbasta-llm-rag-v2`'s
  LlamaIndex docstore (a leaked ransomware-gang chat log, chunked — not a
  clean dataframe) into real timestamped messages, groups them into
  sessions, and computes the same feature vector Agent 2 uses at inference.
- **Normal class**: `extract_lmsys_features.py` does the same over
  LMSYS-Chat-1M (real multi-turn AI conversations). LMSYS has no per-turn
  timestamps, so `latency_ms` is synthesized from a distribution shaped
  like real AI response times — an intentional, documented asymmetry
  against BlackBasta's real timestamps, not an oversight.
- `train.py` combines both, trains a `RandomForestClassifier`, and refuses
  to save a model that misses the precision bar (0.85). First-pass metrics
  came back suspiciously high (~0.999) — the feature importances showed the
  model was mostly separating on timing-scale artifacts from how the two
  datasets were built, not necessarily generalizable attack behavior. Worth
  retraining with those features down-weighted once real captured session
  data exists to validate against.

## Deployment

Single App Runner service (`castmir-api`), single Docker image
(`backend-py/Dockerfile`, multi-stage: builds `frontend/` first, then
copies the static output into the Python image, which serves both the API
and the frontend). Base images pull from the ECR Public Gallery
(`public.ecr.aws/docker/library/...`), not Docker Hub — CodeBuild's shared
IPs hit Docker Hub's anonymous rate limit during development.

Remote-build pattern (no local Docker): zip the source with correct
forward-slash paths (PowerShell's `Compress-Archive` writes Windows
backslashes into zip entries, which breaks Linux extraction — build zips
with `System.IO.Compression.ZipFile` + explicit entry names instead), upload
to S3, trigger the existing CodeBuild project with a source/buildspec
override, then explicitly call `apprunner start-deployment` — App Runner's
`update-service` does not reliably force a fresh pull of a `:latest`-tagged
image when the tag string itself is unchanged, even if the digest behind it
changed.

## Known gaps / next steps

- Content capture (prompt/response text) is new as of this revision — get
  this in front of FSU's IRB before real pilot users see the consent
  screen, given the increase in data sensitivity versus the original
  metadata-only design.
- `content.js`'s per-site DOM selectors are best-effort, not verified
  against the live sites in a real browser.
- Firefox support is wired via `webextension-polyfill` but not verified in
  an actual Firefox instance. Safari needs a separate Xcode-based
  conversion, out of scope so far.
- DuckDB is a single file baked into the container — resets on every
  redeploy, fine for the pilot phase, not for real accumulated data.
  Migrating to Postgres/RDS is schema-compatible whenever that's needed.
- The security classifier's training-time metrics are not yet trustworthy
  (see above) — don't cite the raw precision/recall numbers externally
  without the caveat.
