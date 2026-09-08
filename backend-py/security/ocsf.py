"""
CASTmir — OCSF (Open Cybersecurity Schema Framework) event formatter.

Formats every security finding from Agent 2's classifier as an OCSF v1.5.0
Security Finding event (class_uid 2001) for direct SIEM ingestion.

Note: the architecture doc's own example JSON used class_uid 2004 and paired
severity_id 3 with the label "High" — verified against schema.ocsf.io and
both are wrong (2001 is Security Finding's real class_uid; severity_id 3 is
Medium, not High). Fixed here rather than copied, since a genuinely
SIEM-ingestible payload is the whole point of using OCSF in the first place.
"""
from datetime import datetime, timezone

from config import settings

SEVERITY_ID = {"low": 2, "medium": 3, "high": 4, "critical": 5}
CONFIDENCE_ID = {"low": 1, "medium": 2, "high": 3}


def confidence_id_for(confidence: float) -> int:
    if confidence >= 0.85:
        return CONFIDENCE_ID["high"]
    if confidence >= 0.6:
        return CONFIDENCE_ID["medium"]
    return CONFIDENCE_ID["low"]


def format_ocsf_event(*, user_hash: str, session_id: str, tool: str,
                       threat_type: str, severity: str, confidence: float,
                       observables: dict, desc: str | None = None) -> dict:
    """Build a Security Finding (class_uid 2001) OCSF event. desc is the
    plain-English justification for this specific finding — either the
    content classifier's own LLM-generated reasoning, or (for the
    behavioral path, which never reads prompt/response text) a
    deterministic explanation built from the feature values that actually
    tripped the detection — see security/classifier.py's _justify(). Shown
    on the admin dashboard for every alert, and required reading for a
    high-severity one specifically."""
    now = datetime.now(timezone.utc)
    return {
        "activity_id": 1,          # Create
        "category_uid": 2,          # Findings
        "class_uid": 2001,           # Security Finding
        "severity_id": SEVERITY_ID.get(severity, 0),
        "severity": severity.capitalize(),
        "state_id": 1,                 # New
        "status": "New",
        "time": int(now.timestamp() * 1000),
        "type_uid": 200101,               # class_uid * 100 + activity_id
        "cloud": {"provider": "AWS", "region": settings.aws_region},
        "osint": [],
        "finding": {
            "type": threat_type.replace("_", " ").title(),
            "types": [threat_type],
            "confidence": confidence,
            "confidence_id": confidence_id_for(confidence),
            "desc": desc or "No detailed justification available for this finding.",
        },
        "actor": {"user": {"uid": user_hash, "type": "User"}},
        "resources": [{"name": tool, "type": "AI Tool", "uid": session_id}],
        "metadata": {
            "product": {"name": "CASTmir", "version": "1.0.0"},
            "version": settings.ocsf_version,
        },
        "observables": [
            {"name": k, "value": str(v), "type": "Other"} for k, v in observables.items()
        ],
    }
