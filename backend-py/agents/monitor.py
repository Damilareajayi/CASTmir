"""
CASTmir — Agent 1: Performance Monitor.

Scores every AI session on quality and prompt maturity. Since content
capture was added, real prompt/response text is available when the
extension sends it — compute_pmi_from_text gives a more accurate score than
the structural-signal-only version, which now serves as the fallback for
any event that arrives without text (e.g. a user who hasn't upgraded their
extension yet, or a future opt-out).
"""
import re


def compute_pmi(word_count: int, prompt_chars: int, has_format: bool,
                 has_constraint: bool, has_role: bool, has_example: bool) -> int:
    """Prompt Maturity Index (1-5) from structural signals only — fallback
    when raw text isn't available."""
    score = 1
    if word_count > 15:
        score += 1
    if prompt_chars > 200:
        score += 1
    if has_format or has_constraint:
        score += 1
    if has_role and has_example:
        score += 1
    return min(score, 5)


def compute_pmi_from_text(prompt_text: str) -> int:
    """Prompt Maturity Index (1-5), computed directly from real prompt text —
    same signal categories as compute_pmi, just measured precisely instead
    of via client-side proxies. Ported from the original Node implementation
    (backend/scoring.js's computePMI)."""
    if not prompt_text:
        return 1
    words = prompt_text.split()
    has_role = bool(re.search(r"\b(you are|act as|as an?)\b", prompt_text, re.I))
    has_format = bool(re.search(r"\b(format|bullet|list|table|step|json|markdown)\b", prompt_text, re.I))
    has_constraint = bool(re.search(r"\b(must|should|don'?t|avoid|only|limit|maximum|minimum)\b", prompt_text, re.I))
    has_context = len(prompt_text) > 200
    has_example = bool(re.search(r"\b(example|for instance|such as)\b", prompt_text, re.I))

    score = 1
    if len(words) > 15:
        score += 1
    if has_context:
        score += 1
    if has_format or has_constraint:
        score += 1
    if has_role and has_example:
        score += 1
    return min(score, 5)


def compute_quality(output_chars: int, latency_ms: int | None, turn_number: int,
                     pmi_score: int) -> float:
    """
    Heuristic quality score (0-100) — response depth, structural signals, and
    session engagement. Still not a full LLM-as-judge pass over the response
    text (that's a heavier, separate call — COACH's Bedrock path — not run on
    every single turn), but this is the number that decides whether COACH
    gets triggered.
    """
    depth = min(output_chars / 50, 30)          # longer responses -> more substantive, capped
    engagement = min(turn_number * 2, 20)         # sustained back-and-forth -> more engaged
    pmi_boost = (pmi_score - 3) * 4               # well-formed prompts tend to get better answers
    latency_penalty = 8 if (latency_ms and latency_ms > 15_000) else 0  # stalled/errored response
    quality = 50 + depth + engagement + pmi_boost - latency_penalty
    return round(max(0.0, min(100.0, quality)), 1)
