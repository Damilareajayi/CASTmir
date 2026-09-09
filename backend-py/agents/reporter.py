"""
CASTmir — Agent 4: Reporting Engine.

Feeds the two dashboards. user_dashboard() is scoped to a single user_hash —
nothing here should ever let one user's query return another user's rows.
admin_dashboard() is aggregate-only and never keys off a specific user_hash
in its output.

Every query result goes through .fetchdf() rather than raw .fetchall(), then
through jsonutil.records() rather than a plain .to_dict("records") — that
helper is what fixes both a NaN-vs-NULL JSON-serialization crash and a
timestamp-timezone display bug that otherwise live at this exact boundary.
See jsonutil.py's own docstring for why both need fixing here rather than
per-call-site.
"""
import duckdb

from jsonutil import records as _records


def _user_timezone(con: duckdb.DuckDBPyConnection, user_hash: str) -> str:
    row = con.execute("SELECT timezone FROM users WHERE user_hash = ?", [user_hash]).fetchone()
    return row[0] if row and row[0] else "UTC"


def _identity_timezone(con: duckdb.DuckDBPyConnection, identity: str) -> str:
    """An identity can span several devices (see admin_user_dashboard's own
    docstring on why) — uses whichever device most recently reported a
    real timezone, rather than picking arbitrarily among them."""
    row = con.execute(
        """
        SELECT u.timezone
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND u.timezone IS NOT NULL
        ORDER BY s.timestamp_prompt DESC LIMIT 1
        """, [identity],
    ).fetchone()
    return row[0] if row and row[0] else "UTC"


# A naive TIMESTAMP column here always holds a UTC instant (every writer in
# this codebase uses datetime.utcnow()) — so converting it to someone's
# local calendar day takes TWO AT TIME ZONE conversions, not one: the first
# (`AT TIME ZONE 'UTC'`) turns the naive value into a real UTC instant, the
# second (`AT TIME ZONE ?`) re-expresses that instant as a naive local
# timestamp in the target zone. Applying AT TIME ZONE directly to the naive
# column just relabels the same clock digits as if they belonged to that
# zone, without actually shifting them — verified empirically before this
# was trusted anywhere, since getting it backwards would silently produce
# wrong days rather than obviously fail.
def _local_day(column: str) -> str:
    return f"date_trunc('day', ({column} AT TIME ZONE 'UTC') AT TIME ZONE ?)"


def user_dashboard(con: duckdb.DuckDBPyConnection, user_hash: str, days: int = 30) -> dict:
    tz = _user_timezone(con, user_hash)

    quality_trend = con.execute(
        f"""
        SELECT {_local_day('timestamp_prompt')} AS date, avg(quality_score) AS quality
        FROM sessions
        WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [tz, user_hash, days],
    ).fetchdf().pipe(_records)

    pmi_trend = con.execute(
        f"""
        SELECT {_local_day('timestamp_prompt')} AS date, avg(pmi_score) AS pmi
        FROM sessions
        WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [tz, user_hash, days],
    ).fetchdf().pipe(_records)

    # avg_pmi alongside avg_quality — "what have I done on each tool, and
    # how mature are my prompts there" in one row per tool, instead of only
    # the overall PMI trend line telling you that across every tool at once.
    tool_breakdown = con.execute(
        """
        SELECT tool, count(DISTINCT session_id) AS sessions,
               avg(quality_score) AS avg_quality, avg(pmi_score) AS avg_pmi
        FROM sessions WHERE user_hash = ? AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY tool ORDER BY sessions DESC
        """, [user_hash, days],
    ).fetchdf().pipe(_records)

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
    ).fetchdf().pipe(_records)

    # No ocsf_payload here — this is the private, single-person dashboard,
    # and OCSF (the SIEM-ingestible technical format) belongs on the admin
    # Security tab only, where it's exported deliberately, not scattered
    # into a view meant for a person checking their own activity.
    security_events = con.execute(
        """
        SELECT event_id, threat_type, severity, status, detected_at
        FROM security_events WHERE user_hash = ? ORDER BY detected_at DESC LIMIT 25
        """, [user_hash],
    ).fetchdf().pipe(_records)

    recent_interventions = con.execute(
        """
        SELECT intervention_id, type, pmi_before, pmi_after, recommendation, delivered_at
        FROM interventions WHERE user_hash = ? ORDER BY delivered_at DESC LIMIT 10
        """, [user_hash],
    ).fetchdf().pipe(_records)

    return {
        "timezone": tz,
        "quality_trend": quality_trend,
        "pmi_trend": pmi_trend,
        "tool_breakdown": tool_breakdown,
        "sessions": sessions,
        "security_events": security_events,
        "recent_interventions": recent_interventions,
    }


def admin_dashboard(con: duckdb.DuckDBPyConnection, days: int = 30) -> dict:
    # Cohort-wide charts stay in UTC deliberately — "each user's timezone"
    # is a per-person concept; there's no single correct local day to bucket
    # a chart representing many people across many zones at once. Per-person
    # timezone-correct views live in user_dashboard()/admin_user_dashboard().
    accuracy_trend = con.execute(
        """
        SELECT date_trunc('day', timestamp_prompt) AS date, avg(quality_score) AS quality,
               count(DISTINCT session_id) AS sessions
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [days],
    ).fetchdf().pipe(_records)

    drift_events = con.execute(
        """
        SELECT drift_type, count(*) AS n FROM sessions
        WHERE drift_type IS NOT NULL AND timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY drift_type
        """, [days],
    ).fetchdf().pipe(_records)

    # ocsf_payload IS included here on purpose — this is the admin-only
    # Security tab's data, where the raw OCSF finding is meant to be
    # available (see routers/dashboard.py's separate OCSF-download path,
    # which reads straight from this same field).
    security_feed = con.execute(
        """
        SELECT event_id, threat_type, severity, confidence, ocsf_payload, status, detected_at
        FROM security_events ORDER BY detected_at DESC LIMIT 50
        """,
    ).fetchdf().pipe(_records)

    # A unified, chronological log across both signal types CASTmir raises
    # — security findings and performance drift — so "what happened, day by
    # day" is one place to look instead of two separate aggregate charts.
    event_log = con.execute(
        """
        SELECT detected_at AS ts, 'security' AS kind, threat_type AS label,
               severity, confidence, event_id AS ref_id
        FROM security_events
        WHERE detected_at >= now() - INTERVAL (?) DAY
        UNION ALL
        SELECT timestamp_prompt AS ts, 'drift' AS kind, drift_type AS label,
               NULL AS severity, NULL AS confidence, turn_id AS ref_id
        FROM sessions
        WHERE drift_type IS NOT NULL AND timestamp_prompt >= now() - INTERVAL (?) DAY
        ORDER BY ts DESC
        LIMIT 300
        """, [days, days],
    ).fetchdf().pipe(_records)

    pmi_distribution = con.execute(
        """
        SELECT pmi_score, count(*) AS n, avg(quality_score) AS avg_quality
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY pmi_score ORDER BY pmi_score
        """, [days],
    ).fetchdf().pipe(_records)

    tool_comparison = con.execute(
        """
        SELECT tool, count(DISTINCT session_id) AS sessions, avg(quality_score) AS avg_quality,
               avg(pmi_score) AS avg_pmi, avg(threat_score) AS avg_threat
        FROM sessions WHERE timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY tool ORDER BY sessions DESC
        """, [days],
    ).fetchdf().pipe(_records)

    intervention_outcomes = con.execute(
        """
        SELECT type, count(*) AS n, avg(pmi_after - pmi_before) AS avg_pmi_gain,
               avg(quality_after - quality_before) AS avg_quality_gain
        FROM interventions GROUP BY type
        """,
    ).fetchdf().pipe(_records)

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
    ).fetchdf().pipe(_records)

    # "How often and how well are people improving through COACH" — splits
    # each identity's own session history in the period into an early half
    # and a recent half and compares average PMI between them, alongside how
    # many COACH suggestions they actually received. Needs at least 4
    # sessions to say anything meaningful about a trend; fewer than that and
    # "early vs recent" is just noise.
    user_improvement = con.execute(
        """
        WITH ranked AS (
            SELECT
                COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) AS identity,
                s.pmi_score,
                row_number() OVER (PARTITION BY COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8))
                                    ORDER BY s.timestamp_prompt) AS rn,
                count(*) OVER (PARTITION BY COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8))) AS total_n
            FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
            WHERE s.timestamp_prompt >= now() - INTERVAL (?) DAY
        )
        SELECT identity, total_n AS sessions,
               avg(CASE WHEN rn <= total_n / 2 THEN pmi_score END) AS early_avg_pmi,
               avg(CASE WHEN rn > total_n / 2 THEN pmi_score END) AS recent_avg_pmi
        FROM ranked
        GROUP BY identity, total_n
        HAVING total_n >= 4
        """, [days],
    ).fetchdf().pipe(_records)

    intervention_counts = dict(con.execute(
        """
        SELECT COALESCE(u.alias, 'anon-' || substr(iv.user_hash, 1, 8)) AS identity, count(*) AS n
        FROM interventions iv LEFT JOIN users u ON u.user_hash = iv.user_hash
        WHERE iv.delivered_at >= now() - INTERVAL (?) DAY
        GROUP BY identity
        """, [days],
    ).fetchall())

    for row in user_improvement:
        early, recent = row["early_avg_pmi"], row["recent_avg_pmi"]
        row["pmi_gain"] = round(recent - early, 2) if early is not None and recent is not None else None
        row["intervention_count"] = intervention_counts.get(row["identity"], 0)
    user_improvement.sort(key=lambda r: (r["pmi_gain"] is None, -(r["pmi_gain"] or 0)))

    return {
        "accuracy_trend": accuracy_trend,
        "drift_events": drift_events,
        "security_feed": security_feed,
        "event_log": event_log,
        "pmi_distribution": pmi_distribution,
        "tool_comparison": tool_comparison,
        "intervention_outcomes": intervention_outcomes,
        "user_activity": user_activity,
        "user_improvement": user_improvement,
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
    tz = _identity_timezone(con, identity)

    quality_trend = con.execute(
        f"""
        SELECT {_local_day('s.timestamp_prompt')} AS date, avg(s.quality_score) AS quality
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [tz, identity, days],
    ).fetchdf().pipe(_records)

    pmi_trend = con.execute(
        f"""
        SELECT {_local_day('s.timestamp_prompt')} AS date, avg(s.pmi_score) AS pmi
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY 1 ORDER BY 1
        """, [tz, identity, days],
    ).fetchdf().pipe(_records)

    tool_breakdown = con.execute(
        """
        SELECT s.tool, count(DISTINCT s.session_id) AS sessions,
               avg(s.quality_score) AS avg_quality, avg(s.pmi_score) AS avg_pmi
        FROM sessions s LEFT JOIN users u ON u.user_hash = s.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(s.user_hash, 1, 8)) = ? AND s.timestamp_prompt >= now() - INTERVAL (?) DAY
        GROUP BY s.tool ORDER BY sessions DESC
        """, [identity, days],
    ).fetchdf().pipe(_records)

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
    ).fetchdf().pipe(_records)

    # ocsf_payload included here too — an admin drilling into one person is
    # still on the admin side of the content-privacy boundary, same as
    # admin_dashboard()'s security_feed.
    security_events = con.execute(
        """
        SELECT e.event_id, e.threat_type, e.severity, e.confidence, e.ocsf_payload, e.status, e.detected_at
        FROM security_events e LEFT JOIN users u ON u.user_hash = e.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(e.user_hash, 1, 8)) = ?
        ORDER BY e.detected_at DESC LIMIT 25
        """, [identity],
    ).fetchdf().pipe(_records)

    recent_interventions = con.execute(
        """
        SELECT iv.intervention_id, iv.type, iv.pmi_before, iv.pmi_after, iv.recommendation, iv.delivered_at
        FROM interventions iv LEFT JOIN users u ON u.user_hash = iv.user_hash
        WHERE COALESCE(u.alias, 'anon-' || substr(iv.user_hash, 1, 8)) = ?
        ORDER BY iv.delivered_at DESC LIMIT 10
        """, [identity],
    ).fetchdf().pipe(_records)

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
        "timezone": tz,
        "quality_trend": quality_trend,
        "pmi_trend": pmi_trend,
        "tool_breakdown": tool_breakdown,
        "sessions": sessions,
        "security_events": security_events,
        "recent_interventions": recent_interventions,
    }
