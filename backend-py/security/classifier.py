"""
CASTmir — Agent 2 Track 2, behavioral path: security threat classifier.

The RandomForest (trained by training/train.py on LMSYS-Chat-1M as the normal
class and BlackBasta LLM RAG as the attack class) gives a binary threat_score.
The specific threat_type label is then assigned by a lightweight rule-based
sub-classifier over the same feature vector — the architecture doc describes
a single "threat classification label" output without specifying how the
5-way label (prompt_injection / mcp_attack / rag_poisoning / data_exfiltration
/ anomaly) is derived from a model trained on a 2-class dataset, so this is
the most defensible reading: the ML model answers "is this attack-shaped?",
the rules answer "what does it look like?". Revisit once classifier.pkl
exists and we can see what training/evaluate.py actually supports.

Runs alongside a second Track 2 path (security/content_classifier.py),
which reads the actual prompt/response text instead of behavioral features
— see that module's docstring for why both paths run independently rather
than one replacing the other.
"""
import pathlib
import joblib

from security.features import FEATURE_NAMES

_MODEL_PATH = pathlib.Path(__file__).parent / "models" / "classifier.pkl"
_model = None


def _load_model():
    global _model
    if _model is None and _MODEL_PATH.exists():
        _model = joblib.load(_MODEL_PATH)
    return _model


def classify(features: list[float]) -> dict:
    model = _load_model()
    if model is None:
        # No trained model yet — fail safe to "no threat detected" rather than
        # block session ingestion. train.py must run before this is meaningful.
        return {"threat_score": 0.0, "threat_type": None, "reasoning": None, "trained": False}

    threat_score = float(model.predict_proba([features])[0][1])
    threat_type = _subclassify(features) if threat_score > 0.5 else None
    reasoning = _justify(features, threat_type) if threat_type else None
    return {"threat_score": round(threat_score, 3), "threat_type": threat_type, "reasoning": reasoning, "trained": True}


def _subclassify(features: list[float]) -> str:
    f = dict(zip(FEATURE_NAMES, features))
    if f["cumulative_token_spike"] > 2.0 and f["session_velocity"] > 5:
        return "data_exfiltration"
    if f["latency_spike_flag"] and f["output_char_variance"] > 5000:
        return "rag_poisoning"
    if f["prompt_chars"] > 2000 and f["pmi_score"] <= 2:
        return "prompt_injection"
    if f["token_ratio"] > 5:
        return "mcp_attack"
    return "anomaly"


# This path never reads prompt/response text (see features.py's docstring),
# so it has no free-text explanation the way the content-based path does —
# the model itself only answers "attack-shaped or not". This gives the same
# kind of one-sentence justification the LLM path produces, built from the
# actual feature values that tripped the matching _subclassify() branch,
# rather than leaving a high-severity alert with no stated reason at all.
def _justify(features: list[float], threat_type: str) -> str:
    f = dict(zip(FEATURE_NAMES, features))
    if threat_type == "data_exfiltration":
        return (f"Input volume spiked to {f['cumulative_token_spike']:.1f}x this user's usual baseline "
                f"with {f['session_velocity']:.1f} turns/min — consistent with bulk data extraction rather than normal use.")
    if threat_type == "rag_poisoning":
        return (f"Response latency spiked well beyond this user's normal pattern and output length varied by "
                f"{f['output_char_variance']:.0f} chars² — consistent with retrieval content that was manipulated or malformed.")
    if threat_type == "prompt_injection":
        return (f"An unusually long prompt ({f['prompt_chars']:.0f} chars) paired with a low prompt-maturity "
                f"score (PMI {f['pmi_score']:.0f}) — consistent with an injected instruction block rather than a genuine detailed request.")
    if threat_type == "mcp_attack":
        return f"Input-to-output token ratio ({f['token_ratio']:.1f}x) is far outside normal range — consistent with a tool/plugin being redirected into unintended behavior."
    return "Behavioral pattern doesn't match this user's normal usage, but doesn't clearly fit a specific known attack pattern."
