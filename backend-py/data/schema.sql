-- CASTmir — DuckDB schema (pilot). Migrates to Postgres/RDS with the same
-- shape for production; DuckDB's SQL dialect is close enough to Postgres
-- that this file should need only minor changes when that migration happens.

CREATE TABLE IF NOT EXISTS sessions (
    session_id         VARCHAR NOT NULL,
    turn_id            VARCHAR PRIMARY KEY,
    user_hash          VARCHAR NOT NULL,
    tool               VARCHAR NOT NULL,
    model_version      VARCHAR,
    timestamp_prompt   TIMESTAMP NOT NULL,
    timestamp_response TIMESTAMP,
    latency_ms         INTEGER,
    turn_number        INTEGER,
    prompt_chars       INTEGER,
    output_chars       INTEGER,
    input_tokens       INTEGER,
    output_tokens      INTEGER,
    pmi_score          INTEGER,
    quality_score      FLOAT,
    threat_score       FLOAT,
    drift_type         VARCHAR,
    security_flag      BOOLEAN DEFAULT FALSE,
    prompt_text        TEXT,
    response_text      TEXT,
    created_at         TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
    event_id       VARCHAR PRIMARY KEY,
    user_hash      VARCHAR NOT NULL,
    session_id     VARCHAR NOT NULL,
    turn_id        VARCHAR,
    threat_type    VARCHAR NOT NULL,
    severity       VARCHAR NOT NULL,
    confidence     FLOAT NOT NULL,
    ocsf_payload   JSON NOT NULL,
    status         VARCHAR DEFAULT 'active',
    detected_at    TIMESTAMP NOT NULL,
    resolved_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interventions (
    intervention_id       VARCHAR PRIMARY KEY,
    user_hash             VARCHAR NOT NULL,
    session_id            VARCHAR,
    turn_id                VARCHAR,
    type                   VARCHAR NOT NULL,
    original_prompt_chars INTEGER,
    pmi_before            INTEGER,
    pmi_after             INTEGER,
    quality_before         FLOAT,
    quality_after          FLOAT,
    recommendation         TEXT,
    delivered_at           TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    user_hash          VARCHAR PRIMARY KEY,
    alias              VARCHAR,
    role               VARCHAR,
    college            VARCHAR,
    department         VARCHAR,
    consented_at       TIMESTAMP NOT NULL,
    last_active        TIMESTAMP,
    extension_version  VARCHAR
);

-- Idempotent migration for databases created before content capture was
-- added — CREATE TABLE IF NOT EXISTS above is a no-op against an existing
-- table, so new columns need adding explicitly.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS prompt_text TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS response_text TEXT;
-- alias: the RECAST team alias a user chooses at consent time. user_hash
-- stays the private, unguessable key that scopes a user's own dashboard URL
-- (an alias is human-chosen and potentially guessable/recognizable, so it
-- must never be used for that); alias exists purely so admin can recognize
-- the same real person across devices/reinstalls (each generates its own
-- random user_hash) without needing anyone's actual name.
ALTER TABLE users ADD COLUMN IF NOT EXISTS alias VARCHAR;
-- IANA timezone name (e.g. "America/New_York"), captured client-side via
-- Intl.DateTimeFormat().resolvedOptions().timeZone at consent time. Lets
-- day-bucketed queries (quality trend, PMI trend, the event log) group by
-- THIS person's actual calendar day instead of UTC's — a session logged
-- at 9pm Eastern was landing in "tomorrow" on every chart before this.
-- NULL falls back to UTC (pre-existing users, or a capture failure).
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions(tool);
CREATE INDEX IF NOT EXISTS idx_events_user   ON security_events(user_hash);
CREATE INDEX IF NOT EXISTS idx_events_status ON security_events(status);

-- Site selectors live here, not just hardcoded in the shipped extension, so
-- a broken selector (an AI site changed its DOM) can be fixed by an admin
-- PUT to /api/admin/site-configs/{hostname} — live for every installed
-- extension within one background.js refresh cycle — instead of needing a
-- new extension version and waiting for users to update. content.js still
-- ships a bundled copy of these same values as a fallback for the very
-- first load (before any fetch has completed) or if the fetch ever fails.
CREATE TABLE IF NOT EXISTS site_configs (
    hostname                VARCHAR PRIMARY KEY,
    tool                     VARCHAR NOT NULL,
    prompt_input             VARCHAR NOT NULL,
    submit_button            VARCHAR,
    response_container       VARCHAR NOT NULL,
    model_version_selector   VARCHAR,
    updated_at               TIMESTAMP DEFAULT now()
);

INSERT INTO site_configs (hostname, tool, prompt_input, submit_button, response_container, model_version_selector) VALUES
    ('chatgpt.com',            'ChatGPT',    '#prompt-textarea',                     '[data-testid="send-button"]',   '[data-assistant-markdown]',        NULL),
    ('chat.openai.com',        'ChatGPT',    '#prompt-textarea',                     '[data-testid="send-button"]',   '[data-assistant-markdown]',        NULL),
    ('claude.ai',              'Claude',     '[data-testid="chat-input"]',           '[aria-label="Send Message"]',   '.font-claude-response',            NULL),
    ('gemini.google.com',      'Gemini',     'div.ql-editor[contenteditable="true"]', 'button[aria-label="Send message"]', '.markdown-main-panel.md-content', NULL),
    ('copilot.microsoft.com',  'Copilot',    '#userInput',                            '[aria-label="Submit message"]', '[id*="-content-"]',                NULL),
    ('www.perplexity.ai',      'Perplexity', '#ask-input',                            'button[aria-label="Submit"]',   '[class*="final-text"]',             NULL)
ON CONFLICT (hostname) DO NOTHING;

-- Lets CASTmir notice a broken selector automatically instead of waiting
-- for someone to report it. content.js pings this a few seconds after
-- page load (giving the site's own JS time to render its composer) with
-- whether promptInput actually resolved to a real element.
CREATE TABLE IF NOT EXISTS selector_health (
    id                 VARCHAR PRIMARY KEY,
    hostname           VARCHAR NOT NULL,
    tool               VARCHAR,
    prompt_input_found BOOLEAN NOT NULL,
    -- 'specific' (the site's own selector matched), 'generic' (that
    -- selector found nothing, but content.js's tag/role-based fallback —
    -- textarea/contenteditable/role=textbox — caught it anyway), or NULL
    -- (neither found anything). A site parked on 'generic' means capture
    -- still works but the specific selector needs fixing.
    via                VARCHAR,
    checked_at         TIMESTAMP NOT NULL
);
ALTER TABLE selector_health ADD COLUMN IF NOT EXISTS via VARCHAR;

CREATE INDEX IF NOT EXISTS idx_selector_health_hostname ON selector_health(hostname);
