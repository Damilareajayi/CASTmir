"""CASTmir — dashboard data endpoints for the two frontends."""
from fastapi import APIRouter, Depends

from agents import reporter
from data.db import get_db
from deps import require_admin
from jsonutil import records as _records

router = APIRouter()


@router.get("/api/user/{user_hash}/dashboard")
def get_user_dashboard(user_hash: str, days: int = 30, con=Depends(get_db)):
    return reporter.user_dashboard(con, user_hash, days)


@router.get("/api/admin/dashboard", dependencies=[Depends(require_admin)])
def get_admin_dashboard(days: int = 30, con=Depends(get_db)):
    return reporter.admin_dashboard(con, days)


@router.get("/api/admin/users/{identity}/dashboard", dependencies=[Depends(require_admin)])
def get_admin_user_dashboard(identity: str, days: int = 30, con=Depends(get_db)):
    """identity is the same string shown in admin_dashboard()'s user_activity
    rows — the person's alias, or an anon-<hash prefix> fallback for anyone
    without one. Aggregates across all of that identity's devices."""
    return reporter.admin_user_dashboard(con, identity, days)


@router.get("/api/admin/security-events", dependencies=[Depends(require_admin)])
def get_security_events(con=Depends(get_db)):
    rows = con.execute(
        "SELECT event_id, threat_type, severity, confidence, ocsf_payload, status, detected_at "
        "FROM security_events ORDER BY detected_at DESC LIMIT 100",
    ).fetchdf().pipe(_records)
    return rows


@router.get("/api/admin/drift-events", dependencies=[Depends(require_admin)])
def get_drift_events(con=Depends(get_db)):
    rows = con.execute(
        "SELECT turn_id, user_hash, tool, drift_type, quality_score, timestamp_prompt "
        "FROM sessions WHERE drift_type IS NOT NULL ORDER BY timestamp_prompt DESC LIMIT 100",
    ).fetchdf().pipe(_records)
    return rows
