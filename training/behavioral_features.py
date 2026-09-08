"""
CASTmir — shared per-turn behavioral feature computation, used by both
extract_features.py (BlackBasta, real timestamps) and extract_lmsys_features.py
(LMSYS-Chat-1M, synthesized latency — see that file for why). Kept in one
place so both classes are computed with identical math; only the inputs differ.
"""
import re
import statistics


def compute_pmi_proxy(text: str) -> int:
    """Same rule-based heuristic as backend-py/agents/monitor.py and
    extract_features.py — kept identical across all three so the feature
    space training sees matches what inference computes."""
    words = text.split()
    score = 1
    if len(words) > 15:
        score += 1
    if len(text) > 200:
        score += 1
    if re.search(r"\b(format|list|step|table)\b", text, re.I):
        score += 1
    if re.search(r"\b(you|we)\b", text, re.I) and re.search(r"\b(example|like)\b", text, re.I):
        score += 1
    return min(score, 5)


class RollingHistory:
    """Per-session running history for the spike/variance features — call
    `.features_for(...)` before `.push(...)` for each turn, in order."""

    def __init__(self):
        self.tokens: list[float] = []
        self.output_chars: list[float] = []
        self.latency: list[float] = []

    def features_for(self, prompt_chars: int, output_chars: int, latency_ms: float,
                      turn_number: int, session_start_gap_minutes: float,
                      input_tokens: int, output_tokens: int, pmi_score: int) -> dict:
        token_ratio = input_tokens / output_tokens
        session_velocity = turn_number / max(session_start_gap_minutes, 0.5)

        user_mean = statistics.fmean(self.tokens) if self.tokens else input_tokens
        cumulative_token_spike = (input_tokens - user_mean) / (user_mean or 1)

        output_char_variance = (
            statistics.pvariance(self.output_chars) if len(self.output_chars) > 1 else 0.0
        )

        if len(self.latency) > 1:
            lat_mean = statistics.fmean(self.latency)
            lat_std = statistics.pstdev(self.latency) or 1
            latency_spike_flag = 1.0 if (latency_ms - lat_mean) > 3 * lat_std else 0.0
        else:
            latency_spike_flag = 0.0

        return {
            "prompt_chars": float(prompt_chars),
            "output_chars": float(output_chars),
            "latency_ms": float(latency_ms),
            "turn_number": float(turn_number),
            "token_ratio": token_ratio,
            "session_velocity": session_velocity,
            "pmi_score": float(pmi_score),
            "cumulative_token_spike": cumulative_token_spike,
            "output_char_variance": output_char_variance,
            "latency_spike_flag": latency_spike_flag,
        }

    def push(self, input_tokens: int, output_chars: int, latency_ms: float):
        self.tokens.append(input_tokens)
        self.output_chars.append(output_chars)
        self.latency.append(latency_ms)


FEATURE_COLUMNS = [
    "prompt_chars", "output_chars", "latency_ms", "turn_number", "token_ratio",
    "session_velocity", "pmi_score", "cumulative_token_spike",
    "output_char_variance", "latency_spike_flag",
]
