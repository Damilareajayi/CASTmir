"""
CASTmir — behavioral feature extraction for the security classifier.

Every feature here is derived from session metadata (counts, timing) — never
from prompt or response content. `user_history` is the caller's recent
sessions for this user (queried from DuckDB), used to compute per-user
baselines so a spike is relative to *that person's* normal usage, not a
global average.
"""
import statistics


def extract_features(session: dict, user_history: list[dict]) -> list[float]:
    prompt_chars = session.get("prompt_chars") or 0
    output_chars = session.get("output_chars") or 0
    latency_ms = session.get("latency_ms") or 0
    turn_number = session.get("turn_number") or 1
    input_tokens = session.get("input_tokens") or 0
    output_tokens = session.get("output_tokens") or 1  # avoid div by zero
    pmi_score = session.get("pmi_score") or 1

    token_ratio = input_tokens / output_tokens

    session_started = session.get("session_start_ts")
    session_velocity = (
        turn_number / max((session["timestamp_prompt"] - session_started).total_seconds() / 60, 0.5)
        if session_started else float(turn_number)
    )

    hist_tokens = [h["input_tokens"] for h in user_history if h.get("input_tokens")]
    user_token_mean = statistics.fmean(hist_tokens) if hist_tokens else input_tokens
    cumulative_token_spike = (input_tokens - user_token_mean) / (user_token_mean or 1)

    hist_output_chars = [h["output_chars"] for h in user_history if h.get("output_chars")]
    output_char_variance = statistics.pvariance(hist_output_chars) if len(hist_output_chars) > 1 else 0.0

    hist_latency = [h["latency_ms"] for h in user_history if h.get("latency_ms")]
    if len(hist_latency) > 1:
        lat_mean = statistics.fmean(hist_latency)
        lat_std = statistics.pstdev(hist_latency) or 1
        latency_spike_flag = 1.0 if (latency_ms - lat_mean) > 3 * lat_std else 0.0
    else:
        latency_spike_flag = 0.0

    return [
        float(prompt_chars),
        float(output_chars),
        float(latency_ms),
        float(turn_number),
        token_ratio,
        session_velocity,
        float(pmi_score),
        cumulative_token_spike,
        output_char_variance,
        latency_spike_flag,
    ]


FEATURE_NAMES = [
    "prompt_chars", "output_chars", "latency_ms", "turn_number", "token_ratio",
    "session_velocity", "pmi_score", "cumulative_token_spike",
    "output_char_variance", "latency_spike_flag",
]
