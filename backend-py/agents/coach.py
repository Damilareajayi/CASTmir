"""
CASTmir — Agent 3: Recommendation Engine (COACH).

Performance mode calls Bedrock (same server-side-only credential pattern as
the original Node proxy — nothing AWS-related reaches the browser). Security
mode never calls an external API, for speed: a session flagged by Agent 2's
classifier gets an immediate template-based warning, not a round trip.
"""
import json
import re

import boto3

from config import settings

ALERTS = {
    "prompt_injection": {
        "headline": "Unusual pattern detected in this session",
        "message": "The response you received shows signs of prompt injection. "
                    "Do not follow instructions embedded in the AI's response. Start a new session.",
        "severity": "high",
    },
    "mcp_attack": {
        "headline": "AI tool behavior anomaly detected",
        "message": "This session shows patterns consistent with an MCP manipulation attempt. "
                    "Your AI tool may be responding to hidden instructions. End this session.",
        "severity": "critical",
    },
    "rag_poisoning": {
        "headline": "Retrieval anomaly detected",
        "message": "This response pattern is consistent with a poisoned retrieval source. "
                    "Verify any factual claims independently before relying on them.",
        "severity": "high",
    },
    "data_exfiltration": {
        "headline": "Unusual data volume detected",
        "message": "This session shows a sudden spike in data exchanged, atypical for your usage. "
                    "If you didn't intend to request this much output, end the session.",
        "severity": "critical",
    },
    "anomaly": {
        "headline": "Unusual session pattern",
        "message": "This session doesn't match your typical usage pattern. No specific threat "
                    "confirmed, but stay alert to anything that seems off in the response.",
        "severity": "medium",
    },
}


def security_alert(threat_type: str) -> dict:
    return ALERTS.get(threat_type, ALERTS["anomaly"])


COACH_SYSTEM_PROMPT = """You are COACH, the Recommendation Engine inside CASTmir — an AI performance and security monitor.

Your job: improve a user's AI prompt so they get better output quality, and explain what you changed so they learn over time.

Prompt Maturity Index (PMI) scale:
1 = Vague single query
2 = Task stated, no context
3 = Task + context
4 = Task + context + constraints + format
5 = Role + task + context + constraints + format + examples

Always preserve the user's original intent. Be direct and practical.

Match the rewrite's complexity to what the task actually needs — do not
mechanically push every prompt toward PMI 5. A simple factual lookup
("what's the capital of France") stays simple; padding it with a role,
constraints, and examples it doesn't need makes the rewrite worse, not
better. Add exactly what's missing for THIS task, nothing more.

Never invent specific numbers, deadlines, or constraints the user never
stated and nothing in the provided context implies (an exact word count,
a specific framework version, a deadline). Prefer flexible phrasing ("a
few examples", "roughly a paragraph") over a fabricated precise figure —
a rewrite that quietly adds a made-up requirement is worse than one that
stays general on that point.

The target AI tool shapes what a good prompt looks like — tailor to it,
don't write one generic rewrite regardless of destination:
- ChatGPT: structured, step-by-step instructions and explicit output
  format work well; it follows numbered constraints closely.
- Claude: benefits from explicit reasoning guidance ("think through X
  before Y") and nuanced context; verbose is fine when it's substantive.
- Gemini: handles long context and multi-part tasks well; front-load the
  most important instruction, since very long prompts can bury it.
- Copilot: code- and IDE-context tasks — mention the language/framework
  and surrounding code context explicitly if the user's prompt implies it.
- Perplexity: research/lookup-oriented — a good rewrite often asks
  explicitly for sources or recency (e.g. "cite sources", "as of 2026")
  when the original implies wanting current or verifiable information.

Two kinds of context may be provided below, and they carry different weight:

1. "CONTEXT FROM THIS SAME CONVERSATION" — earlier prompts in the exact
   thread the current prompt belongs to. This is always safe to draw on: use
   REAL specific details from it — names, projects, prior constraints
   already established — instead of generic bracketed placeholders like
   "[Name]" or "[Project]". A rewrite with a placeholder the user still has
   to fill in by hand is worse than one that's actually ready to use.

2. "OTHER PAST CONVERSATIONS" — prompts from this same user, but from
   different, unrelated conversations (possibly a different AI tool,
   possibly a completely different subject or persona). Treat these as
   LOW-CONFIDENCE background only. Before using anything from this section,
   check that it is actually about the same subject as the CURRENT prompt.
   If the current prompt is about a different topic — e.g. it's about
   computer vision and this section is about religion, or it's about
   learning theory and this section is about a work project — IGNORE this
   section entirely. Do not carry over a persona, subject, or specific
   detail from an unrelated past conversation just because it's recent.
   When in doubt, leave it out and use a generic placeholder instead — a
   placeholder is a smaller mistake than an irrelevant detail.

If neither section is relevant, write the rewrite from the current prompt
alone."""


def _format_history_section(label: str, history: list[dict]) -> str:
    lines = []
    for h in history[:5]:
        prompt = (h.get("prompt_text") or "").strip()
        if not prompt:
            continue
        lines.append(f"- ({h.get('tool', 'unknown')}) \"{prompt[:300]}\"")
    if not lines:
        return ""
    return f"\n\n{label} (most recent first):\n" + "\n".join(lines)


def _format_history(same_conversation: list[dict], other_conversations: list[dict]) -> str:
    return (
        _format_history_section("CONTEXT FROM THIS SAME CONVERSATION", same_conversation)
        + _format_history_section("OTHER PAST CONVERSATIONS (different thread — judge relevance before using, per the instructions above)", other_conversations)
    )


def _parse_rewrite_response(text: str) -> dict:
    stripped = re.sub(r"```json|```", "", text).strip()
    match = re.search(r"\{[\s\S]*\}", stripped)
    return json.loads(match.group(0) if match else stripped)


def rewrite_prompt(original_prompt: str, tool: str | None, same_conversation: list[dict],
                    other_conversations: list[dict], max_tokens: int = 900) -> dict:
    """Performance mode — Bedrock Converse call. Builds the system/user
    prompt here (single source of truth — previously duplicated in the
    extension and the website, which had already drifted into two near-
    identical copies), enriched with the user's own recent prompt history so
    rewrites can use real specifics instead of placeholder brackets.

    same_conversation and other_conversations are kept separate rather than
    one flat "recent prompts" list: a rewrite grounded in an unrelated past
    conversation (e.g. pulling religion-discussion specifics into a
    computer-vision prompt just because it was recent) is worse than one
    that stays generic — see COACH_SYSTEM_PROMPT for how the model is
    instructed to weigh the two differently."""
    user_prompt = f"""Improve this prompt for better AI output quality.

ORIGINAL PROMPT:
{original_prompt}

CONTEXT:
- AI Tool: {tool or 'Not specified'}{_format_history(same_conversation, other_conversations)}

Respond ONLY with valid JSON (no markdown fences):
{{
  "rewritten_prompt": "The improved prompt",
  "explanation": "2-3 sentences on what changed and why",
  "key_improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "pmi_before": 2,
  "pmi_after": 4
}}"""

    client = boto3.client("bedrock-runtime", region_name=settings.aws_region)

    def _call(tokens: int) -> str:
        result = client.converse(
            modelId=settings.bedrock_model_id,
            system=[{"text": COACH_SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": user_prompt}]}],
            inferenceConfig={"maxTokens": tokens},
        )
        return result["output"]["message"]["content"][0]["text"]

    try:
        return _parse_rewrite_response(_call(max_tokens))
    except (json.JSONDecodeError, AttributeError):
        # A verbose rewrite/explanation can run past max_tokens and get cut
        # off mid-string, which breaks the JSON the model was asked to
        # return — same failure regardless of which AI tool the prompt is
        # for. Retry once with headroom instead of surfacing a raw 500 for
        # what's usually just a token-budget miss.
        return _parse_rewrite_response(_call(min(max_tokens * 2, 2000)))
