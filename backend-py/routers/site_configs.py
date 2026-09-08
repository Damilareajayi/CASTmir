"""
CASTmir — site selector configs, served remotely so a broken selector (an
AI site changed its DOM) can be fixed with one admin PUT instead of a new
extension release. See data/schema.sql's site_configs table comment.

Also collects selector_health pings from content.js — a few seconds after
page load, it checks whether promptInput actually resolved to a real
element and reports the result here, so a broken selector shows up as a
dropping found-rate on the admin dashboard automatically instead of
waiting for someone to notice and report it.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from data.db import get_db
from deps import require_admin

router = APIRouter()


@router.get("/api/site-configs")
def get_site_configs(con=Depends(get_db)):
    """Public — these are CSS selectors, not sensitive data, and the
    extension needs them before a user has any admin/auth context."""
    rows = con.execute(
        "SELECT hostname, tool, prompt_input, submit_button, response_container, model_version_selector "
        "FROM site_configs",
    ).fetchdf().to_dict("records")
    return {
        r["hostname"]: {
            "tool": r["tool"],
            "promptInput": r["prompt_input"],
            "submitButton": r["submit_button"],
            "responseContainer": r["response_container"],
            "modelVersionSelector": r["model_version_selector"],
        }
        for r in rows
    }


class SiteConfigUpdate(BaseModel):
    tool: str
    prompt_input: str
    submit_button: str | None = None
    response_container: str
    model_version_selector: str | None = None


@router.put("/api/admin/site-configs/{hostname}", dependencies=[Depends(require_admin)])
def update_site_config(hostname: str, cfg: SiteConfigUpdate, con=Depends(get_db)):
    con.execute(
        """
        INSERT INTO site_configs (hostname, tool, prompt_input, submit_button, response_container, model_version_selector, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (hostname) DO UPDATE SET
            tool = excluded.tool, prompt_input = excluded.prompt_input,
            submit_button = excluded.submit_button, response_container = excluded.response_container,
            model_version_selector = excluded.model_version_selector, updated_at = excluded.updated_at
        """,
        [hostname, cfg.tool, cfg.prompt_input, cfg.submit_button, cfg.response_container,
         cfg.model_version_selector, datetime.utcnow()],
    )
    return {"ok": True, "hostname": hostname}


class SelectorHealthPing(BaseModel):
    hostname: str
    tool: str | None = None
    prompt_input_found: bool
    # 'specific', 'generic' (content.js's tag/role-based fallback caught it
    # instead), or None. See data/schema.sql's selector_health comment.
    via: str | None = None


@router.post("/api/selector-health")
def report_selector_health(ping: SelectorHealthPing, con=Depends(get_db)):
    con.execute(
        "INSERT INTO selector_health (id, hostname, tool, prompt_input_found, via, checked_at) VALUES (?, ?, ?, ?, ?, ?)",
        [str(uuid.uuid4()), ping.hostname, ping.tool, ping.prompt_input_found, ping.via, datetime.utcnow()],
    )
    return {"ok": True}


@router.get("/api/admin/selector-health", dependencies=[Depends(require_admin)])
def get_selector_health(hours: int = 24, con=Depends(get_db)):
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = con.execute(
        """
        SELECT hostname, tool,
               count(*) AS checks,
               sum(CASE WHEN prompt_input_found THEN 1 ELSE 0 END) AS found,
               sum(CASE WHEN via = 'generic' THEN 1 ELSE 0 END) AS via_generic,
               max(checked_at) AS last_checked_at
        FROM selector_health
        WHERE checked_at >= ?
        GROUP BY hostname, tool
        ORDER BY hostname
        """, [since],
    ).fetchdf().to_dict("records")
    for r in rows:
        r["found_rate"] = round(r["found"] / r["checks"], 3) if r["checks"] else None
    return rows
