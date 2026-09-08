"""
CASTmir — Agent 2: Degradation + Security Diagnostician.

Two tracks run independently per session, split by problem domain:
  Track 1 (performance) — CUSUM drift detection, ported 1:1 from the original
  Node implementation (backend/scoring.js) — same math, ported to Python.
  Track 2 (security)    — two independent detection paths, not one:
    - behavioral: ML classifier over behavioral features (timing/length/
      counts only, never prompt/response text), see security/classifier.py.
      Untrained until training/train.py produces a classifier.pkl.
    - content-based: an LLM classifier over the actual prompt/response
      text, see security/content_classifier.py.
  The two Track 2 paths run independently so either can catch what the
  other misses (behavioral catches anomalies with no textual signal;
  content-based catches a well-disguised attack that looks behaviorally
  ordinary) — routers/sessions.py runs both and keeps whichever found the
  higher-confidence match.
"""
import math

from config import settings


def run_cusum(series: list[float], baseline: float, k: float | None = None,
               h: float | None = None) -> dict:
    """Page's CUSUM — detects when a series shifts from its baseline."""
    k = settings.cusum_k if k is None else k
    h = settings.cusum_h if h is None else h

    variance = sum((x - baseline) ** 2 for x in series) / len(series)
    std = math.sqrt(variance) or 1.0

    s_high = s_low = 0.0
    alarm = False
    alarm_at = None
    hist: list[float] = []

    for i, x in enumerate(series):
        z = (baseline - x) / std
        s_high = max(0.0, s_high + z - k)
        s_low = max(0.0, s_low - z - k)
        hist.extend([s_high, s_low])
        if not alarm and (s_high > h or s_low > h):
            alarm, alarm_at = True, i

    return {"alarm": alarm, "alarm_at": alarm_at, "max_cusum": round(max(hist), 2)}


def classify_drift(quality_drop: float, pmi_drop: float, quality_std: float) -> str:
    if pmi_drop > 0.3 and quality_drop > 5:
        return "prompt_drift"
    if quality_std > 8 and quality_drop > 5:
        return "context_drift"
    return "model_drift"


def detect_drift(quality_series: list[float], pmi_series: list[float]) -> dict | None:
    """Full drift analysis over a user's recent quality/PMI series. None if no significant degradation."""
    if len(quality_series) < 6:
        return None

    mid = len(quality_series) // 2
    base = sum(quality_series[:mid]) / mid
    recent = sum(quality_series[mid:]) / (len(quality_series) - mid)
    drop = base - recent
    if drop < 4:
        return None

    cusum = run_cusum(quality_series, base)
    if not cusum["alarm"]:
        return None

    pmi_base = sum(pmi_series[:mid]) / (mid or 1)
    pmi_recent = sum(pmi_series[mid:]) / ((len(pmi_series) - mid) or 1)
    std = math.sqrt(sum((x - base) ** 2 for x in quality_series) / len(quality_series))

    return {
        "drift_type": classify_drift(drop, pmi_base - pmi_recent, std),
        "severity": "high" if drop >= 10 else "medium" if drop >= 6 else "low",
        "baseline_score": round(base, 1),
        "current_score": round(recent, 1),
        "score_delta": round(-drop, 1),
        "cusum_value": cusum["max_cusum"],
        "alarm_at": cusum["alarm_at"],
        "series_length": len(quality_series),
    }
