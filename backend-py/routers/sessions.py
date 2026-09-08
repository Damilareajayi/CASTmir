"""CASTmir — session ingestion. The extension posts here after every AI turn."""
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from agents import coach, diagnostician, monitor
from data.db import backup_to_s3, get_db
from security import classifier, content_classifier, features, ocsf

router = APIRouter()


class SessionEvent(BaseModel):
    session_id: str
    user_hash: str
    tool: str
    model_version: str | None = None
    timestamp_prompt: datetime
    timestamp_response: datetime | None = None
    latency_ms: int | None = None
    turn_number: int = 1
    prompt_chars: int = 0
    output_chars: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    # Structural signals, derived client-side from the DOM — kept even now
    # that raw text is also captured, so scoring doesn't require re-parsing
    # text server-side for the common case.
    word_count: int = 0
    has_format: bool = False
    has_constraint: bool = False
    has_role: bool = False
    has_example: bool = False
    # Raw content — captured per the consent screen's disclosure.
    prompt_text: str | None = None
    response_text: str | None = None


@router.post("/api/session/event")
def ingest_session(event: SessionEvent, background_tasks: BackgroundTasks, con=Depends(get_db)):
    if event.prompt_text:
        pmi_score = monitor.compute_pmi_from_text(event.prompt_text)
    else:
        pmi_score = monitor.compute_pmi(
            event.word_count, event.prompt_chars, event.has_format,
            event.has_constraint, event.has_role, event.has_example,
        )
    quality_score = monitor.compute_quality(
        event.output_chars, event.latency_ms, event.turn_number, pmi_score,
    )

    # Recent history for this user, for drift + security baselines.
    history = con.execute(
        """
        SELECT quality_score, pmi_score, input_tokens, output_chars, latency_ms
        FROM sessions WHERE user_hash = ? ORDER BY timestamp_prompt DESC LIMIT 50
        """, [event.user_hash],
    ).fetchdf().to_dict("records")

    drift = None
    if len(history) >= 5:
        quality_series = [h["quality_score"] for h in reversed(history)] + [quality_score]
        pmi_series = [h["pmi_score"] for h in reversed(history)] + [pmi_score]
        drift = diagnostician.detect_drift(quality_series, pmi_series)

    feature_vector = features.extract_features(
        {**event.model_dump(), "session_start_ts": event.timestamp_prompt}, history,
    )
    behavioral_threat = classifier.classify(feature_vector)
    # Behavioral features alone (timing/length/counts) miss a well-disguised
    # injection with ordinary shape — this reads the actual text on every
    # turn as a second, independent detection path. Whichever path found
    # the higher-confidence match wins; either one alone can still trigger
    # an alert below.
    content_threat = content_classifier.classify_content(event.prompt_text, event.response_text, event.tool)
    threat = content_threat if content_threat["threat_score"] >= behavioral_threat["threat_score"] else behavioral_threat

    turn_id = str(uuid.uuid4())
    con.execute(
        """
        INSERT INTO sessions (session_id, turn_id, user_hash, tool, model_version,
            timestamp_prompt, timestamp_response, latency_ms, turn_number,
            prompt_chars, output_chars, input_tokens, output_tokens,
            pmi_score, quality_score, threat_score, drift_type, security_flag,
            prompt_text, response_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [event.session_id, turn_id, event.user_hash, event.tool, event.model_version,
         event.timestamp_prompt, event.timestamp_response, event.latency_ms, event.turn_number,
         event.prompt_chars, event.output_chars, event.input_tokens, event.output_tokens,
         pmi_score, quality_score, threat["threat_score"], drift["drift_type"] if drift else None,
         threat["threat_score"] > 0.65, event.prompt_text, event.response_text],
    )

    background_tasks.add_task(backup_to_s3)  # don't make the caller wait on an S3 round trip
    response = {"pmi_score": pmi_score, "quality_score": quality_score, "drift": drift, "alert": None}

    if threat["threat_score"] > 0.65 and threat["threat_type"]:
        event_id = str(uuid.uuid4())
        payload = ocsf.format_ocsf_event(
            user_hash=event.user_hash, session_id=event.session_id, tool=event.tool,
            threat_type=threat["threat_type"], severity=coach.security_alert(threat["threat_type"])["severity"],
            confidence=threat["threat_score"],
            observables={
                "turn_number": event.turn_number, "threat_score": threat["threat_score"],
                "detection_method": "content" if threat is content_threat else "behavioral",
            },
        )
        con.execute(
            """
            INSERT INTO security_events (event_id, user_hash, session_id, turn_id, threat_type,
                severity, confidence, ocsf_payload, detected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [event_id, event.user_hash, event.session_id, turn_id, threat["threat_type"],
             payload["severity"].lower(), threat["threat_score"], payload, datetime.utcnow()],
        )
        response["alert"] = coach.security_alert(threat["threat_type"])

    return response
