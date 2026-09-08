"""CASTmir — user registration at extension install / consent time."""
from datetime import datetime
from zoneinfo import available_timezones

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from data.db import get_db

router = APIRouter()

_VALID_TIMEZONES = available_timezones()


class UserRegistration(BaseModel):
    user_hash: str
    alias: str | None = None
    role: str | None = None
    college: str | None = None
    department: str | None = None
    extension_version: str | None = None
    timezone: str | None = None


@router.post("/api/users/register")
def register(user: UserRegistration, con=Depends(get_db)):
    now = datetime.utcnow()
    # A malformed timezone string would make every later AT TIME ZONE query
    # for this person throw instead of silently falling back to UTC — worth
    # a real validation, not just trusting whatever the browser reported.
    tz = user.timezone if user.timezone in _VALID_TIMEZONES else None
    con.execute(
        """
        INSERT INTO users (user_hash, alias, role, college, department, timezone, consented_at, last_active, extension_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_hash) DO UPDATE SET
            last_active = excluded.last_active,
            alias = COALESCE(excluded.alias, users.alias),
            timezone = COALESCE(excluded.timezone, users.timezone)
        """,
        [user.user_hash, user.alias, user.role, user.college, user.department, tz, now, now, user.extension_version],
    )
    return {"ok": True, "user_hash": user.user_hash}
