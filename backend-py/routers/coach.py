"""CASTmir — COACH prompt-rewrite endpoint. Performance mode only; security
mode never goes through here (see agents/coach.security_alert, called
directly from sessions.py for speed)."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from agents import coach
from data.db import get_db

router = APIRouter()


class RewriteRequest(BaseModel):
    prompt: str
    tool: str | None = None
    user_hash: str | None = None
    session_id: str | None = None
    max_tokens: int = 900


@router.post("/api/coach/rewrite")
def rewrite(req: RewriteRequest, con=Depends(get_db)):
    # Two separate pools, not one: prompts from THIS conversation are always
    # topically safe to ground a rewrite in (same thread, same subject).
    # Prompts from OTHER past conversations might be about something
    # completely unrelated (e.g. a religion discussion from days ago,
    # bleeding into today's computer-vision prompt) — those go to the model
    # separately and labeled as such, so it can judge relevance instead of
    # treating "recent" as "relevant". See agents/coach.py's docstring.
    same_conversation, other_conversations = [], []
    if req.user_hash and req.session_id:
        same_conversation = con.execute(
            """
            SELECT prompt_text, tool
            FROM sessions
            WHERE user_hash = ? AND session_id = ? AND prompt_text IS NOT NULL AND prompt_text != ''
            ORDER BY timestamp_prompt DESC
            LIMIT 5
            """, [req.user_hash, req.session_id],
        ).fetchdf().to_dict("records")
    if req.user_hash:
        other_conversations = con.execute(
            """
            SELECT prompt_text, tool
            FROM sessions
            WHERE user_hash = ? AND session_id != ? AND prompt_text IS NOT NULL AND prompt_text != ''
            ORDER BY timestamp_prompt DESC
            LIMIT 5
            """, [req.user_hash, req.session_id or ''],
        ).fetchdf().to_dict("records")

    return coach.rewrite_prompt(req.prompt, req.tool, same_conversation, other_conversations, req.max_tokens)


class InterventionLog(BaseModel):
    user_hash: str
    session_id: str | None = None
    type: str = "rewrite"
    original_prompt_chars: int | None = None
    pmi_before: int | None = None
    pmi_after: int | None = None
    recommendation: str | None = None


@router.post("/api/coach/intervention")
def log_intervention(iv: InterventionLog, con=Depends(get_db)):
    """Nothing wrote to the interventions table before this endpoint
    existed — the "Recent COACH suggestions" panel on every dashboard
    (user, admin drill-down) was permanently empty by construction, not
    from a query bug. content.js calls this right after a rewrite is
    successfully shown, so it reflects "COACH delivered a suggestion" —
    not (yet) whether the user actually accepted it."""
    con.execute(
        """
        INSERT INTO interventions (intervention_id, user_hash, session_id, type,
            original_prompt_chars, pmi_before, pmi_after, recommendation, delivered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [str(uuid.uuid4()), iv.user_hash, iv.session_id, iv.type,
         iv.original_prompt_chars, iv.pmi_before, iv.pmi_after, iv.recommendation, datetime.utcnow()],
    )
    return {"ok": True}
