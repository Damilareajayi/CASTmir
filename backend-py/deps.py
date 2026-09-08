"""CASTmir backend — shared FastAPI dependencies."""
from fastapi import Header, HTTPException

from config import settings


def require_admin(x_admin_token: str | None = Header(default=None)):
    """Gate for every /api/admin/* route. The token is never baked into the
    frontend bundle (that would defeat the purpose — anyone can read a built
    JS file) — it's entered by the admin at runtime and held in
    sessionStorage on the client, sent as a header on each request."""
    if not x_admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin access required")
