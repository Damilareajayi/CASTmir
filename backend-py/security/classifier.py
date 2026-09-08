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
        return {"threat_score": 0.0, "threat_type": None, "trained": False}

    threat_score = float(model.predict_proba([features])[0][1])
    threat_type = _subclassify(features) if threat_score > 0.5 else None
    return {"threat_score": round(threat_score, 3), "threat_type": threat_type, "trained": True}


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
