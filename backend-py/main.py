"""CASTmir backend — FastAPI entry point."""
import asyncio
import contextlib
import pathlib

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from data.db import backup_loop, backup_to_s3
from routers import alerts, coach, dashboard, sessions, site_configs, users


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(backup_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    backup_to_s3()  # best-effort final snapshot — App Runner may not always grant this time


app = FastAPI(title="CASTmir", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    """Neither StaticFiles nor FileResponse set Cache-Control by default —
    browsers fall back to heuristic caching off ETag/Last-Modified alone,
    which is exactly wrong here after a redeploy: index.html references
    Vite's content-hashed asset filenames (e.g. index-<hash>.js), and every
    deploy replaces dist/assets/ entirely rather than keeping old files
    around. A browser serving a stale cached index.html can point at an
    asset file a newer deploy already deleted — a real, observed bug (the
    admin dashboard silently failing to load until a hard refresh). Same
    risk for anything else FileResponse serves directly by path (e.g.
    castmir-extension.zip, which has also gone stale in a browser cache
    before) since none of those are content-hashed either.
    /assets/* is the one exception: Vite guarantees a changed file gets a
    new filename, so old cached copies are simply never requested again —
    safe, and worth caching aggressively rather than re-validating on every
    page load."""
    response = await call_next(request)
    if request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.method == "GET" and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-cache"
    return response

app.include_router(sessions.router)
app.include_router(dashboard.router)
app.include_router(coach.router)
app.include_router(alerts.router)
app.include_router(users.router)
app.include_router(site_configs.router)


@app.get("/api/health")
def health():
    return {"ok": True, "source": "CASTmir backend — FastAPI + DuckDB"}


# ── Static frontend (built by the Docker image's frontend-build stage) ────
PUBLIC_DIR = pathlib.Path(__file__).parent / "public"
if PUBLIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=PUBLIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str, request: Request):
        # Never swallow a mistyped/removed /api/* path into an HTML 200 —
        # that's a confusing silent failure for API clients. Only frontend
        # routes fall through to index.html.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = PUBLIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(PUBLIC_DIR / "index.html")
