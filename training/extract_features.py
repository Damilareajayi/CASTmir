"""
CASTmir — feature extraction for the security classifier's ATTACK class.

Source: blackbasta-llm-rag-v2's LlamaIndex docstore (indices/v3/docstore.json)
— a pre-chunked index over one 18MB leaked chat log, NOT a clean dataframe.
This reconstructs the original document from its chunks (parsing per-chunk
loses ~15% of messages at chunk boundaries), parses individual timestamped
messages, groups them into "sessions" by inter-message time gaps, and
computes the same behavioral feature vector security/features.py expects at
inference time — just over ransomware-gang coordination chat instead of real
AI-tool sessions. That's a proxy label ("attack-adjacent behavioral
fingerprint"), not literal AI usage; worth remembering when reading the
model's precision/recall later.

Usage:
    python extract_features.py --docstore path/to/docstore.json --out attack_features.parquet
"""
import argparse
import json
import re
from datetime import datetime

import pandas as pd

from behavioral_features import RollingHistory, compute_pmi_proxy

MESSAGE_PATTERN = re.compile(
    r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (@\S+)\s*\n(.*?)(?=\n\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - @|\Z)",
    re.S,
)

# A gap longer than this starts a new "session" — same idea as grouping AI
# tool turns into a session by inactivity, just applied to chat bursts.
SESSION_GAP_MINUTES = 30


def reconstruct_document(docstore_path: str) -> str:
    """Stitch chunks back into the original document by start_char_idx, so
    message parsing isn't broken by arbitrary 512-token chunk boundaries."""
    with open(docstore_path, encoding="utf-8") as f:
        doc = json.load(f)

    nodes = [n["__data__"] for n in doc["docstore/data"].values()]
    nodes.sort(key=lambda n: n.get("start_char_idx") or 0)

    parts = []
    last_end = -1
    for n in nodes:
        start = n.get("start_char_idx") or 0
        if start <= last_end:
            continue  # overlapping chunk — already covered by the previous one
        parts.append(n["text"])
        last_end = n.get("end_char_idx") or (start + len(n["text"]))
    return "\n".join(parts)


def parse_messages(full_text: str) -> list[dict]:
    messages = []
    for ts, user, text in MESSAGE_PATTERN.findall(full_text):
        try:
            timestamp = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        messages.append({"timestamp": timestamp, "user": user, "text": text.strip()})
    messages.sort(key=lambda m: m["timestamp"])
    return messages


def group_into_sessions(messages: list[dict]) -> list[list[dict]]:
    if not messages:
        return []
    sessions, current = [], [messages[0]]
    for prev, msg in zip(messages, messages[1:]):
        gap = (msg["timestamp"] - prev["timestamp"]).total_seconds() / 60
        if gap > SESSION_GAP_MINUTES:
            sessions.append(current)
            current = []
        current.append(msg)
    sessions.append(current)
    return [s for s in sessions if len(s) >= 2]  # need at least 2 turns for latency features


def extract_session_features(session: list[dict]) -> list[dict]:
    rows = []
    history = RollingHistory()

    for i, msg in enumerate(session):
        prompt_chars = len(msg["text"])
        # No "response" concept in raw chat — the *next* message stands in
        # for it, same way one AI turn's output feeds the next turn's context.
        output_chars = len(session[i + 1]["text"]) if i + 1 < len(session) else prompt_chars
        latency_ms = (
            int((session[i + 1]["timestamp"] - msg["timestamp"]).total_seconds() * 1000)
            if i + 1 < len(session) else 0
        )
        input_tokens = max(1, prompt_chars // 4)  # rough chars->tokens, consistent with the rest of the project
        output_tokens = max(1, output_chars // 4)
        pmi_score = compute_pmi_proxy(msg["text"])
        gap_minutes = (msg["timestamp"] - session[0]["timestamp"]).total_seconds() / 60

        features = history.features_for(
            prompt_chars, output_chars, latency_ms, i + 1, gap_minutes,
            input_tokens, output_tokens, pmi_score,
        )
        rows.append({**features, "label": 1})  # attack class
        history.push(input_tokens, output_chars, latency_ms)

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--docstore", required=True)
    parser.add_argument("--out", default="attack_features.parquet")
    args = parser.parse_args()

    print(f"reconstructing document from {args.docstore} ...")
    full_text = reconstruct_document(args.docstore)
    print(f"reconstructed {len(full_text):,} chars")

    messages = parse_messages(full_text)
    print(f"parsed {len(messages):,} messages from {len(set(m['user'] for m in messages))} distinct users")

    sessions = group_into_sessions(messages)
    print(f"grouped into {len(sessions):,} sessions (>= 2 turns, <= {SESSION_GAP_MINUTES}min gaps)")

    all_rows = [row for session in sessions for row in extract_session_features(session)]
    df = pd.DataFrame(all_rows)
    df.to_parquet(args.out)
    print(f"wrote {len(df):,} feature rows to {args.out}")


if __name__ == "__main__":
    main()
