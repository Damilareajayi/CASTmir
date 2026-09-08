"""CASTmir — user registration at extension install / consent time."""
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from data.db import get_db

router = APIRouter()


class UserRegistration(BaseModel):
    user_hash: str
    alias: str | None = None
    role: str | None = None
    college: str | None = None
    department: str | None = None
    extension_version: str | None = None


@router.post("/api/users/register")
def register(user: UserRegistration, con=Depends(get_db)):
    now = datetime.utcnow()
    con.execute(
        """
        INSERT INTO users (user_hash, alias, role, college, department, consented_at, last_active, extension_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_hash) DO UPDATE SET
            last_active = excluded.last_active,
            alias = COALESCE(excluded.alias, users.alias)
        """,
        [user.user_hash, user.alias, user.role, user.college, user.department, now, now, user.extension_version],
    )
    return {"ok": True, "user_hash": user.user_hash}
