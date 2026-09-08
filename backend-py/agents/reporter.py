"""
CASTmir — Agent 4: Reporting Engine.

Feeds the two dashboards. user_dashboard() is scoped to a single user_hash —
nothing here should ever let one user's query return another user's rows.
admin_dashboard() is aggregate-only and never keys off a specific user_hash
in its output.

Every query result goes through .fetchdf() rather than raw .fetchall(), and
pandas converts a SQL NULL in a numeric column to NaN — which Starlette's
JSONResponse (allow_nan=False) refuses to serialize, crashing the WHOLE
endpoint with a 500, not just the one field. This bit us for real: an
avg() over an all-NULL group (interventions.quality_before/after, which
nothing writes yet) stayed harmless only because the interventions table
was empty; the moment a real row existed, admin_dashboard() 500'd
entirely. .replace({np.nan: None}) after every .fetchdf() is the fix,
applied everywhere rather than just at the query that happened to trigger
it, since the same failure mode is latent in any avg()/similar aggregate
here whenever a group's inputs are all NULL.
"""
import duckdb
import numpy as np


def user_dashboard(con: duckdb.DuckDBPyConnection, user_hash: str, days: int = 30) -> dict:
    quality_trend = con.execute(
        """
        SELECT date_trunc('day', timestamp_prompt) AS date, avg(quality_score) AS quality
        FROM sessions
        WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [user_hash, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    pmi_trend = con.execute(
        """
        SELECT date_trunc('day', timestamp_prompt) AS date, avg(pmi_score) AS pmi
        FROM sessions
        WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [user_hash, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    tool_breakdown = con.execute(
        """
        SELECT tool, count(DISTINCT session_id) AS sessions, avg(quality_score) AS avg_quality
        FROM sessions WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY tool ORDER BY sessions DESC
        """, [user_hash, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    # Real per-session rollups, grouped by the session_id the extension already
    # generates per tab (content.js's ensureSession()). Every turn in a
    # session — including short clarifying replies — used to be scored and
    # counted independently, which both mislabeled turn counts as "sessions"
    # and let quick clarifying turns drag down what should be a single
    # conversation's score. session_pmi takes the best-formed prompt shown in
    # the conversation rather than penalizing it for shorter supporting
    # turns; outcome_quality is the quality of the chronologically last turn
    # (arg_max), i.e. how good the actual final result was.
    sessions = con.execute(
        """
        SELECT
            session_id,
            tool,
            min(timestamp_prompt) AS session_start,
            max(coalesce(timestamp_response, timestamp_prompt)) AS session_end,
            count(*) AS turn_count,
            max(pmi_score) AS session_pmi,
            avg(quality_score) AS avg_turn_quality,
            arg_max(quality_score, timestamp_prompt) AS outcome_quality,
            bool_or(security_flag) AS flagged
        FROM sessions
        WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY session_id, tool
        ORDER BY session_start DESC
        LIMIT 30
        """, [user_hash, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    security_events = con.execute(
        """
        SELECT event_id, threat_type, severity, status, detected_at
        FROM security_events WHERE user_hash = ? ORDER BY detected_at DESC LIMIT 25
        """, [user_hash],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    recent_interventions = con.execute(
        """
        SELECT intervention_id, type, pmi_before, pmi_after, recommendation, delivered_at
        FROM interventions WHERE user_hash = ? ORDER BY delivered_at DESC LIMIT 10
        """, [user_hash],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    return {
        "quality_trend": quality_trend,
        "pmi_trend": pmi_trend,
        "tool_breakdown": tool_breakdown,
        "sessions": sessions,
        "security_events": security_events,
        "recent_interventions": recent_interventions,
    }


def admin_dashboard(con: duckdb.DuckDBPyConnection, days: int = 30) -> dict:
    accuracy_trend = con.execute(
        """
        SELECT date_trunc('day', timestamp_prompt) AS date, avg(quality_score) AS quality,
               count(DISTINCT session_id) AS sessions
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    drift_events = con.execute(
        """
        SELECT drift_type, count(*) AS n FROM sessions
        WHERE drift_type IS NOT NULL AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY drift_type
        """, [days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    security_feed = con.execute(
        """
        SELECT event_id, threat_type, severity, confidence, ocsf_payload, status, detected_at
        FROM security_events ORDER BY detected_at DESC LIMIT 50
        """,
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    pmi_distribution = con.execute(
        """
        SELECT pmi_score, count(*) AS n, avg(quality_score) AS avg_quality
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY pmi_score ORDER BY pmi_score
        """, [days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    tool_comparison = con.execute(
        """
        SELECT tool, count(DISTINCT session_id) AS sessions, avg(quality_score) AS avg_quality,
               avg(threat_score) AS avg_threat
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY tool ORDER BY sessions DESC
        """, [days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    intervention_outcomes = con.execute(
        """
        SELECT type, count(*) AS n, avg(pmi_after - pmi_before) AS avg_pmi_gain,
               avg(quality_after - quality_before) AS avg_quality_gain
        FROM interventions GROUP BY type
        """,
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    # Per-person visibility for admin — grouped by the RECAST alias chosen at
    # consent time, NOT user_hash directly, so the same real person using
    # CASTmir on multiple devices (each with its own random user_hash) shows
    # up as one row instead of several. Falls back to a short, non-reversible
    # label for anyone who hasn't set an alias, so those users still get
    # their own row instead of being merged together under a blank identity.
    # Deliberately metrics-only (session counts, quality/PMI, last-active) —
    # never prompt_text/response_text — same content-privacy boundary as the
    # rest of this admin view.
    #
    # LEFT JOIN, not JOIN: a session whose user_hash has NO matching users
    # row at all (registration never completed — a real bug that shipped
    # for a while, see popup.js's CASTmir_ENSURE_USER_HASH comment) used to
    # vanish from this table entirely under a plain JOIN, instead of at
    # least showing up anonymously the way a registered-but-alias-less user
    # would. Falling back to s.user_hash (always present) rather than
    # u.user_hash (NULL when there's no match) is what makes that fallback
    # actually fire in that case instead of producing 'anon-None'.
    user_activity = con.execute(
        """
        SELECT
            COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) AS identity,
            count(DISTINCT s.user_hash) AS devices,
            count(DISTINCT s.session_id) AS sessions,
            avg(s.quality_score) AS avg_quality,
            avg(s.pmi_score) AS avg_pmi,
            max(s.timestamp_prompt) AS last_active
        FROM sessions s
        LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8))
        ORDER BY sessions DESC
        LIMIT 100
        """, [days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    return {
        "accuracy_trend": accuracy_trend,
        "drift_events": drift_events,
        "security_feed": security_feed,
        "pmi_distribution": pmi_distribution,
        "tool_comparison": tool_comparison,
        "intervention_outcomes": intervention_outcomes,
        "user_activity": user_activity,
    }


def admin_user_dashboard(con: duckdb.DuckDBPyConnection, identity: str, days: int = 30) -> dict:
    """Admin drill-down into one person, identified by the same alias (or
    anon-<hash prefix> fallback) shown in admin_dashboard()'s user_activity
    rows — NOT by user_hash directly, so a person's devices are combined
    into one view the same way they're combined in that table. Deliberately
    NOT a thin wrapper around user_dashboard(): that function's isolation
    guarantee (never leak one user_hash's rows into another's query) is
    security-critical, so this stays a separate, independently-obviously-
    correct implementation rather than sharing a parameterized WHERE clause
    that could weaken it. Same shape as user_dashboard() otherwise, so the
    frontend can reuse the same rendering.

    LEFT JOIN throughout, same reasoning as user_activity's query in
    admin_dashboard(): an identity with zero successful registrations (no
    matching users row at all) still needs to resolve here, or clicking
    into the anon-<hash> row that fix makes visible would always come back
    empty. Every fallback below reads the base table's own user_hash
    (s.user_hash / e.user_hash / iv.user_hash), never u.user_hash, since
    that's NULL exactly when there's nothing to fall back from.
    """
    quality_trend = con.execute(
        """
        SELECT date_trunc('day', s.timestamp_prompt) AS date, avg(s.quality_score) AS quality
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [identity, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    pmi_trend = con.execute(
        """
        SELECT date_trunc('day', s.timestamp_prompt) AS date, avg(s.pmi_score) AS pmi
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [identity, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    tool_breakdown = con.execute(
        """
        SELECT s.tool, count(DISTINCT s.session_id) AS sessions, avg(s.quality_score) AS avg_quality
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY s.tool ORDER BY sessions DESC
        """, [identity, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    sessions = con.execute(
        """
        SELECT
            s.session_id, s.tool,
            min(s.timestamp_prompt) AS session_start,
            max(coalesce(s.timestamp_response, s.timestamp_prompt)) AS session_end,
            count(*) AS turn_count,
            max(s.pmi_score) AS session_pmi,
            avg(s.quality_score) AS avg_turn_quality,
            arg_max(s.quality_score, s.timestamp_prompt) AS outcome_quality,
            bool_or(s.security_flag) AS flagged
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY s.session_id, s.tool
        ORDER BY session_start DESC
        LIMIT 30
        """, [identity, days],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    security_events = con.execute(
        """
        SELECT e.event_id, e.threat_type, e.severity, e.status, e.detected_at
        FROM security_events e LEFT JOIN users u ON u.user_hash = e.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(e.user_hash, 1, 8)) = ?
        ORDER BY e.detected_at DESC LIMIT 25
        """, [identity],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    recent_interventions = con.execute(
        """
        SELECT iv.intervention_id, iv.type, iv.pmi_before, iv.pmi_after, iv.recommendation, iv.delivered_at
        FROM interventions iv LEFT JOIN users u ON u.user_hash = iv.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(iv.user_hash, 1, 8)) = ?
        ORDER BY iv.delivered_at DESC LIMIT 10
        """, [identity],
    ).fetchdf().replace({np.nan: None}).to_dict("records")

    # Can't count from `users` directly any more (WHERE identity_match) —
    # an identity with no successful registration has no matching users row
    # to count, which would wrongly report 0 devices despite real sessions
    # existing. Count distinct real user_hash values from sessions instead.
    devices = con.execute(
        """
        SELECT count(DISTINCT s.user_hash)
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ?
        """, [identity],
    ).fetchone()[0]

    return {
        "identity": identity,
        "devices": devices,
        "quality_trend": quality_trend,
        "pmi_trend": pmi_trend,
        "tool_breakdown": tool_breakdown,
        "sessions": sessions,
        "security_events": security_events,
        "recent_interventions": recent_interventions,
    }
