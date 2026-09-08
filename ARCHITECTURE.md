# CASTmir — Architecture

CASTmir is a browser extension + web platform that monitors AI tool usage as it
happens: a Chrome extension captures each prompt/response turn on supported AI
sites, a FastAPI/DuckDB backend scores it for quality, maturity, and security
risk, and two separate dashboards surface the results — a private per-user
view and an alias-grouped, aggregate cohort research view — both updating in
real time.

```
┌────────────────────┐   session events    ┌──────────────────────────┐   reads   ┌────────────────────┐
│  extension/         │ ───────────────────▶│  backend-py/              │◀──────────│  frontend/          │
│  content.js          │   POST /api/session │  FastAPI + DuckDB         │           │  UserDashboard.jsx  │
│  background.js       │ ◀───site_configs────│  agents/  (1-4)           │           │  AdminDashboard.jsx │
│  popup.html/js        │                    │  security/ (classifier,   │           │  Landing.jsx        │
│                       │                    │    content_classifier,    │           │                     │
│                       │                    │    OCSF)                  │           │                     │
└────────────────────┘                      └──────────────────────────┘           └────────────────────┘
                                                        │              │
                                                        ▼              ▼
                                          AWS Bedrock (COACH,     S3 (DuckDB backup/
                                          content classifier)     restore; also serves
                                                                  as the CodeBuild
                                                                  source for deploys)
```

All three pieces (`extension/`, `backend-py/`, `frontend/`) are served/deployed
together in production — `backend-py`'s Docker image builds `frontend/` in a
build stage (which also regenerates the extension's install zip fresh from
`extension/` — see Deployment below) and serves the static output itself
(same-origin, no CORS needed for the frontend's own calls). The extension
talks to the deployed backend over HTTPS from any machine it's installed on.

The original `backend/` (Express/SQLite) and `src/` (old single-dashboard
frontend) directories, plus root-level `index.html`/`package.json`, are the
previous PRISM-era architecture — not part of the current system. Do
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
   and a one-time research consent (a RECAST alias, required — the consent
   button stays disabled without one — and an explicit "I consent" click).
   The consent screen discloses, in plain language, that prompt and
   response *content* is captured — see `popup.html`'s `#consent` screen.
   **Enabling CASTmir on a site is what gives consent** — there is no
   separate additional opt-in step for content specifically. The same
   screen also captures the browser's IANA timezone
   (`Intl.DateTimeFormat().resolvedOptions().timeZone`) for later
   timezone-aware reporting (see below).
3. **Send.** `background.js` attaches the persistent anonymized `user_hash`
   (generated once, lazily, the first time anything actually needs one —
   see `ensureUserHash()` — and stored in `browser.storage.local`) and
   POSTs the event to `/api/session/event`.
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
     / data_exfiltration / anomaly) and a matching plain-English
     justification built from the actual feature values that tripped it
     (`_justify()`); and a *content-based* path
     (`security/content_classifier.py`, same Bedrock model as COACH) that
     reads the actual prompt/response text, independently classifies it
     against the same five types, and returns its own LLM-generated
     reasoning. The content-based path exists because the behavioral
     path's signal misses a well-disguised attack with ordinary length and
     timing. `routers/sessions.py` runs both Track 2 paths on every turn
     and keeps whichever found the higher-confidence match — its
     justification carries through into the stored OCSF finding as
     `finding.desc`, so a high-severity alert always comes with a stated
     reason, not just a label.
6. **Store.** Everything — including `prompt_text` and `response_text` —
   is written to DuckDB's `sessions` table (`data/schema.sql`).
7. **Alert (Agent 3 — `agents/coach.py`).** If either track's threat_score >
   0.65, an OCSF-formatted finding (`security/ocsf.py`, tagged with which
   track caught it and carrying its justification) is written to
   `security_events`, and a template-based warning is returned immediately
   in the API response — the alert itself is still template-based either
   way, never a second Bedrock round trip. `background.js` turns that into
   a `chrome.notifications` popup and a red badge on the toolbar icon.
8. **Read (Agent 4 — `agents/reporter.py`).** The two dashboards pull from
   the same tables through two different privacy lenses — see below.

## Reliability — surviving a site's DOM changing under you

Every AI site redesigns its UI without warning, and `content.js`'s
per-site CSS selectors (`#mobile-composer-prompt`, `[data-testid="chat-input"]`,
etc.) are tied to each site's own implementation details — exactly the
kind of thing that breaks on a redesign. Three layers address this,
from fastest to slowest:

1. **Generic fallback detection.** The same technique Grammarly uses: if
   a site's specific `promptInput` selector matches nothing, `content.js`
   falls back to HTML's own semantics for "this accepts text" — a
   `<textarea>`, a `contenteditable` element, `role="textbox"` — picking
   the widest visible candidate (see `resolvePromptInput()`,
   `matchesPromptInput()`). This is spec-level, not site-level, so it
   doesn't go stale the way a CSS selector does. It only covers *input*
   detection, not `responseContainer` — there's no equivalent DOM
   semantic for "this is AI-generated output."
2. **Automatic health signal.** A few seconds after page load (giving the
   site's own JS time to render), `content.js` checks whether
   `promptInput` actually resolved — via the specific selector or the
   generic fallback — and reports the result to
   `POST /api/selector-health`, including *which* path found it. The
   admin dashboard's Agents tab surfaces this as a found-rate per site,
   with a "fallback" badge when a site is running on generic detection
   only — a real signal that a selector needs fixing, not a guess.
3. **Remote-configurable selectors.** Selector values live in the
   `site_configs` DuckDB table, not just hardcoded in the shipped
   extension (`GET /api/site-configs`, `PUT /api/admin/site-configs/{hostname}`
   — see `routers/site_configs.py`). `background.js` fetches and caches
   this on startup and on a 6-hour alarm; `content.js` merges any override
   over its bundled defaults. Fixing a broken selector is one admin PUT,
   live for every installed extension within one refresh cycle — not a
   new extension release and waiting for everyone to update.

## The two dashboards

- **User dashboard** (`frontend/src/UserDashboard.jsx`, `GET
  /api/user/{user_hash}/dashboard`) — strictly scoped to one `user_hash`.
  Every query in `reporter.user_dashboard()` filters on it explicitly, so
  one user's data can never leak into another's view. Reached via the
  popup's "Open full dashboard" button, which passes `?hash=<user_hash>`
  in the URL — no manual ID entry in the normal flow. Shows quality/PMI
  trend, a per-tool comparison (sessions, quality, and average maturity
  side by side — "what have I done on each AI tool"), recent sessions,
  security events (never the OCSF technical payload — that's admin-only,
  see below), recent COACH suggestions, and a personal PDF/Markdown
  report (Daily/Weekly/custom period).
- **Admin dashboard** (`frontend/src/AdminDashboard.jsx`, `GET
  /api/admin/dashboard`) — aggregate-only, grouped by RECAST alias (not
  raw `user_hash`) so the same person across multiple devices shows as
  one row; anyone without a registered alias still gets their own
  `anon-<hash prefix>` row rather than vanishing. Gated behind a real
  server-side check: every `/api/admin/*` route requires an
  `X-Admin-Token` header (`deps.py`'s `require_admin`), checked against
  the `ADMIN_TOKEN` environment variable, held client-side only in
  `sessionStorage` — never baked into the built JS bundle. Clicking an
  alias drills into that person's own aggregated dashboard (`GET
  /api/admin/users/{identity}/dashboard`) — LEFT JOINs throughout, so a
  person who somehow never completed registration still resolves under
  their `anon-` identity instead of the drill-down coming back empty.
  Adds:
  - A **"Prompting improvement" comparison** (`user_improvement` in
    `reporter.admin_dashboard()`) — splits each identity's sessions in
    the current period into an early half and a recent half and compares
    average PMI between them, alongside how many COACH suggestions they
    actually received, to answer "how often and how well are people
    improving through COACH" directly rather than leaving it to inference.
  - A **day-to-day event log** (`event_log`) — security findings and
    performance drift, chronologically, grouped by day.
  - **Severity bucketed to low/mid/high** for display (critical folds
    into "high"), with a prominent banner and inline justification text
    for any active high-severity alert, and a one-click bulk **OCSF JSON
    export** of the raw findings — the SIEM-ingestible format this whole
    layer exists to produce, kept out of the general CSV export (which
    deliberately strips `ocsf_payload`, since it carries raw `user_hash`/
    `session_id`) and off the private user dashboard entirely.
  - **Daily / Weekly / custom report periods** — the Reports tab's period
    buttons set the shared `days` state (so the report matches exactly
    what the rest of the dashboard is showing, not a separately-fetched
    approximation), and `report.js`'s `periodLabel()` reflects that
    choice in the report's own title ("Daily", "Weekly", or "N-Day").

Both dashboards silently re-fetch every 20 seconds (`AUTO_REFRESH_MS`) —
no spinner flash, no scroll jump, no disruption to whatever's currently
in view — with a visible pulsing **"Live · updated Xs ago"** indicator
(`components/UI.jsx`'s `LiveBadge`) so it's obvious the page is actually
alive rather than silently stale.

## Timezone-aware reporting

Every timestamp is stored as a naive UTC instant (every writer in the
codebase uses `datetime.utcnow()`), and day-bucketed queries — quality
trend, PMI trend, the event log — used to group by UTC calendar day
regardless of who was looking. For anyone outside UTC, a session logged
in the evening could land in "tomorrow" on every chart.

The consent screen now captures the browser's real IANA timezone name
(not a raw offset — an offset alone can't account for daylight saving)
and stores it on the `users` row, validated server-side against Python's
`zoneinfo.available_timezones()` before trusting it (a malformed value
would otherwise make every later query for that person throw instead of
falling back cleanly). `reporter.py`'s `_local_day()` helper converts a
naive-UTC column to that person's local calendar day via DuckDB's
`(col AT TIME ZONE 'UTC') AT TIME ZONE ?` — a *double* conversion, not
one: applying `AT TIME ZONE` once to an already-naive-UTC value just
relabels the same clock digits without actually shifting them, which
would silently reproduce the exact bug this was meant to fix. This was
verified empirically against a real DuckDB instance before being trusted
anywhere in production, not assumed from memory.

`user_dashboard()` and `admin_user_dashboard()` (a single person, or one
identity's devices) use this real per-person conversion. The admin
cohort-wide charts (`admin_dashboard()`) deliberately stay in UTC — "each
user's timezone" is a per-person concept, and there's no single correct
local day to bucket a chart representing many people across many zones
at once.

## COACH (Agent 3) and AWS Bedrock

`agents/coach.py`'s `rewrite_prompt()` calls Bedrock's Converse API
(`boto3`) server-side only — nothing AWS-related reaches the browser or
the extension. Model defaults to `us.anthropic.claude-haiku-4-5-20251001-v1:0`
via `BEDROCK_MODEL_ID`. The deployed backend's IAM role
(`prism-apprunner-instance-role`) is scoped to exactly that model ARN.

- **Context, split by relevance, not just "recent."** A rewrite request
  passes two separate pools of the user's prior prompts — `same_conversation`
  (the exact thread this prompt belongs to, always safe to draw real
  specifics from) and `other_conversations` (different, possibly
  unrelated threads, treated as low-confidence background the model must
  actively judge relevance on before using). Without this split, a
  rewrite could ground itself in an unrelated past conversation just
  because it was recent — e.g. pulling religion-discussion specifics into
  a computer-vision prompt.
- **Rewrite-quality guardrails in the system prompt**, not just "make it
  better": match complexity to the actual task (a trivial factual lookup
  stays trivial — no mechanical push toward PMI 5), never invent specific
  numbers/deadlines/constraints the user never stated, and tailor to the
  destination tool's real strengths (e.g. Perplexity rewrites lean toward
  requesting sources/recency; ChatGPT/Copilot rewrites lean toward
  explicit structure).
- **Truncation recovery.** A verbose rewrite can occasionally run past
  the token budget and get cut off mid-JSON — `rewrite_prompt()` retries
  once with a doubled budget on a parse failure instead of surfacing a
  raw 500 for what's usually just a token-budget miss. The same pattern
  is used in `security/content_classifier.py`'s Bedrock call.
- **Interventions are actually logged.** `POST /api/coach/intervention`
  writes to the `interventions` table every time a rewrite is shown
  (type, PMI before/after, the explanation) — the write side didn't exist
  for a while, so "Recent COACH suggestions" and the admin's
  `intervention_outcomes`/`user_improvement` were empty by construction,
  not from a query bug.
- **Widget UX**: Escape closes it, clicking outside dismisses it, and it
  fades/scales in instead of snapping into view — standard popover
  behavior that was missing before.

## Persistence — DuckDB on S3

App Runner containers have no persistent local disk — it resets to empty
on every redeploy, and the platform can recycle an instance on its own
too. `data/db.py` treats the local DuckDB file as a fast cache of state
that's actually durable in S3, not the source of truth itself:

- **Restore on startup** downloads the DuckDB file from
  `S3_BACKUP_BUCKET`/`S3_BACKUP_KEY` before `duckdb.connect()` runs;
  failing to find one (first run, or a fresh bucket) just starts empty.
- **Backup on an interval** (`S3_BACKUP_INTERVAL_SECONDS`, default 60s)
  and after every session write, via a FastAPI `BackgroundTasks` call so
  the caller never waits on the S3 round trip. Critically, it calls
  `CHECKPOINT` immediately before `upload_file()` — DuckDB can hold
  recent writes in its WAL without them being reflected in the main file
  on disk yet, and uploading the raw file without forcing a checkpoint
  first silently backs up a snapshot missing the very write that
  triggered the backup. This was a real bug, caught and fixed.
- **Stale-WAL protection on startup.** A leftover `.wal` file from an
  earlier process on the same (recycled) instance — e.g. one that
  crashed before its own writes were checkpointed — is stale relative to
  whatever main file restore just landed on, either way. Replaying it
  re-applies already-reflected DDL (`CREATE TABLE`, etc.) and crashes
  startup with a "table already exists" error. `restore_from_s3()`
  proactively deletes any local `.wal` after downloading; a reactive
  `try/except CatalogException` around `duckdb.connect()` itself is a
  second safety net in case one reappears between that cleanup and the
  connect call.

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
(`backend-py/Dockerfile`, multi-stage: builds `frontend/` first — which
also regenerates `frontend/public/castmir-extension.zip` fresh from
`extension/` on every build (`zip -rq`, run from inside `extension/` so
the archive has no wrapping top-level folder, matching what Windows'
native Extract-All produces from a flat zip) — then copies both the
frontend build output and that zip into the Python image, which serves
the API and the static frontend from one origin. The zip being
regenerated at build time, not manually maintained, is deliberate: a
manually-updated copy went stale for days once (missing a whole
`vendor/` dependency, so anyone downloading it got a broken extension)
before anyone noticed. Base images pull from the ECR Public Gallery
(`public.ecr.aws/docker/library/...`), not Docker Hub — CodeBuild's
shared IPs hit Docker Hub's anonymous rate limit during development.

Response caching is deliberately asymmetric: `index.html` (and anything
else served by path — the extension zip included) always sends
`Cache-Control: no-cache`, forcing revalidation on every load, while
`/assets/*` (Vite's content-hashed JS/CSS) caches aggressively
(`max-age=31536000, immutable`) since a changed file gets a new filename
by construction. Without the `no-cache` half, a browser could serve a
stale cached `index.html` pointing at asset filenames a newer deploy had
already deleted — a real, observed bug (the admin dashboard silently
failing to load until a hard refresh) fixed by `main.py`'s
`cache_headers` middleware.

Remote-build pattern (no local Docker required): zip the source (Python's
`zipfile` module directly, with explicit forward-slash entry names and
real directory entries — PowerShell's `Compress-Archive` both writes
Windows-style paths that break Linux extraction *and* omits directory
entries that CodeBuild's S3 source extractor needs), upload to S3,
trigger the existing CodeBuild project with a source/buildspec override,
then explicitly call `apprunner start-deployment` — App Runner's
`update-service` does not reliably force a fresh pull of a
`:latest`-tagged image when the tag string itself is unchanged, even if
the digest behind it changed.

## Known gaps / next steps

- `content.js`'s per-site CSS selectors need periodic live re-verification
  against the real sites — they drift whenever a site ships a redesign
  (this has already happened at least once in production). The
  generic-fallback and selector-health systems above soften the impact
  but don't eliminate the need to actually fix a broken selector.
- Firefox support is wired via `webextension-polyfill` but not verified in
  an actual Firefox instance. Safari needs a separate Xcode-based
  conversion, out of scope so far.
- DuckDB is a single file, backed up to S3 but still fundamentally a
  single-writer local file — fine for the pilot's scale, not a real
  multi-instance production database. Migrating to Postgres/RDS is
  schema-compatible whenever that's needed (see `data/schema.sql`'s own
  note).
- The security classifier's training-time metrics are not yet
  trustworthy (see the training section above) — don't cite the raw
  precision/recall numbers externally without that caveat.
- Adding a new supported AI tool beyond the current five still needs the
  same live-DOM-verification process as the original five (manifest
  permission, `SUPPORTED_SITES` entry, and a verified `site_configs`
  row) — the remote-config system makes *fixing* a selector fast, not
  *discovering* the right one in the first place.
