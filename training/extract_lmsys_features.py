"""
CASTmir — feature extraction for the security classifier's NORMAL class.

Source: lmsys/lmsys-chat-1m (HuggingFace, gated). Each row is a full
multi-turn conversation with real user/assistant content and a real turn
count — but NO per-turn timestamp, unlike BlackBasta's real chat log. That's
an honest asymmetry: latency_ms here is synthesized from a lognormal
distribution shaped like real AI-tool response times (a couple seconds,
occasional slower tail), not measured. It's a reasonable proxy — normal AI
turn-taking really is fast and machine-paced, in sharp contrast to
BlackBasta's human-paced coordination chat — but it does mean the classifier
has an easier time on the latency features than on the ones computed from
real timestamps on both sides. Worth remembering when reading eval metrics.

Usage:
    python extract_lmsys_features.py --parquet-dir path/to/lmsys/parquet/shards --out lmsys_features.parquet --sample 200000
"""
import argparse
import glob
import random

import numpy as np
import pandas as pd

from behavioral_features import RollingHistory, compute_pmi_proxy

random.seed(42)
np.random.seed(42)


def synth_latency_ms() -> float:
    """Realistic AI-tool response latency: lognormal centered ~1.8s, long tail
    for slower calls, floor/ceiling clamped to a plausible range."""
    ms = np.random.lognormal(mean=7.5, sigma=0.6)  # exp(7.5) ~= 1808ms
    return float(np.clip(ms, 200, 30_000))


def extract_conversation_features(conversation: list[dict]) -> list[dict]:
    user_turns = [t for t in conversation if t.get("role") == "user"]
    asst_turns = [t for t in conversation if t.get("role") == "assistant"]
    if not user_turns or not asst_turns:
        return []

    rows = []
    history = RollingHistory()
    elapsed_minutes = 0.0

    for i, (u, a) in enumerate(zip(user_turns, asst_turns)):
        prompt_chars = len(u.get("content") or "")
        output_chars = len(a.get("content") or "")
        if prompt_chars == 0:
            continue

        latency_ms = synth_latency_ms()
        elapsed_minutes += latency_ms / 60_000
        input_tokens = max(1, prompt_chars // 4)
        output_tokens = max(1, output_chars // 4)
        pmi_score = compute_pmi_proxy(u["content"])

        features = history.features_for(
            prompt_chars, output_chars, latency_ms, i + 1, elapsed_minutes,
            input_tokens, output_tokens, pmi_score,
        )
        rows.append({**features, "label": 0})  # normal class
        history.push(input_tokens, output_chars, latency_ms)

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parquet-dir", required=True, help="dir containing the downloaded LMSYS parquet shards")
    parser.add_argument("--out", default="lmsys_features.parquet")
    parser.add_argument("--sample", type=int, default=200_000, help="max conversations to process (full dataset is ~1M)")
    args = parser.parse_args()

    shard_paths = sorted(glob.glob(f"{args.parquet_dir}/*.parquet"))
    print(f"found {len(shard_paths)} shard(s)")

    all_rows = []
    processed = 0
    for path in shard_paths:
        if processed >= args.sample:
            break
        df = pd.read_parquet(path, columns=["conversation_id", "conversation", "turn"])
        for _, row in df.iterrows():
            if processed >= args.sample:
                break
            all_rows.extend(extract_conversation_features(row["conversation"]))
            processed += 1
        print(f"  processed {processed:,} conversations so far ({path.split(chr(92))[-1]})")

    out_df = pd.DataFrame(all_rows)
    out_df.to_parquet(args.out)
    print(f"wrote {len(out_df):,} feature rows from {processed:,} conversations to {args.out}")


if __name__ == "__main__":
    main()
