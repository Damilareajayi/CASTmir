"""CASTmir — turning a .fetchdf() DataFrame into JSON-safe records.

Two independent bugs live at this one boundary, so both get fixed here
instead of at each of the ~25 call sites across the codebase:

1. A SQL NULL survives .fetchdf() as NaN in a numeric column, which
   Starlette's JSONResponse (allow_nan=False) refuses to serialize —
   crashing the WHOLE endpoint with a 500, not just the one field. Hit us
   for real once interventions.quality_before/after started holding NULLs.

2. Every naive TIMESTAMP column in this database holds a UTC instant
   (every writer uses datetime.utcnow()), but pandas' default
   .isoformat() on a naive value never says so — it emits e.g.
   "2026-09-09T20:00:00", no "Z", no offset. Per the JS Date spec, a
   date-time string with no timezone marker is parsed as LOCAL time, not
   UTC. The frontend then does `new Date(thatString).toLocaleString()`
   expecting to convert; instead it just hands the same clock digits
   back unchanged — displaying raw UTC as if it were already the
   viewer's local time. In US zones that reads as "N hours in the
   future" (EDT is UTC-4, so a UTC-labeled-as-local timestamp shows 4
   hours ahead of the real local time) — exactly the bug reported live.
   Appending "Z" here makes `new Date()` parse it as the real UTC instant
   it is, so the browser's own .toLocaleString()/.toLocaleTimeString()
   then correctly converts to whichever timezone the *viewer's own
   device* is set to — no per-user stored-timezone lookup needed for
   this, unlike the _local_day() bucketing in reporter.py.

   The one deliberate exception is any column literally named "date":
   that's always a _local_day()-truncated bucket label (see
   reporter.py), a naive value that's already the correct local
   calendar day by construction. Marking THAT one UTC too would make the
   frontend re-shift it and land on the wrong day — so it's left alone.
"""
import numpy as np
import pandas as pd


def records(df: pd.DataFrame) -> list[dict]:
    for col in df.columns:
        if col == "date" or not pd.api.types.is_datetime64_any_dtype(df[col]):
            continue
        df[col] = df[col].apply(lambda v: None if pd.isna(v) else v.isoformat() + "Z")
    return df.replace({np.nan: None}).to_dict("records")
