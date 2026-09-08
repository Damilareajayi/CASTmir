"""CASTmir — active security alerts."""
from fastapi import APIRouter, Depends

from data.db import backup_to_s3, get_db
from deps import require_admin

router = APIRouter()


@router.get("/api/admin/alerts", dependencies=[Depends(require_admin)])
def get_active_alerts(con=Depends(get_db)):
    rows = con.execute(
        "SELECT event_id, user_hash, threat_type, severity, confidence, detected_at "
        "FROM security_events WHERE status = 'active' ORDER BY detected_at DESC",
    ).fetchdf().to_dict("records")
    return rows


@router.delete("/api/admin/sessions/{session_id}", dependencies=[Depends(require_admin)])
def delete_session(session_id: str, con=Depends(get_db)):
    """Data-hygiene utility — e.g. clearing out synthetic test rows posted
    directly against the API during development, without touching real
    captured activity."""
    deleted = con.execute("SELECT count(*) FROM sessions WHERE session_id = ?", [session_id]).fetchone()[0]
    con.execute("DELETE FROM sessions WHERE session_id = ?", [session_id])
    backup_to_s3()
    return {"ok": True, "deleted_rows": deleted}
