"""CASTmir backend — DuckDB connection + schema init.

App Runner containers have no persistent local disk: it's reset to empty on
every redeploy, and the platform can recycle instances on its own too. Data
would otherwise vanish on any of those events even though nothing about the
data itself changed. Restore-on-startup + periodic backup-to-S3 (see
backup_loop, started from main.py's lifespan) makes the local DuckDB file
act as a fast local cache of state that's actually durable in S3, instead of
the source of truth itself.
"""
import logging
import pathlib

import boto3
import duckdb

from config import settings

logger = logging.getLogger("castmir.db")

_SCHEMA_PATH = pathlib.Path(__file__).parent / "schema.sql"
_db_path = pathlib.Path(settings.duckdb_path)


def _s3_client():
    return boto3.client("s3", region_name=settings.aws_region)


def restore_from_s3() -> None:
    if not settings.s3_backup_bucket:
        return
    try:
        _s3_client().download_file(settings.s3_backup_bucket, settings.s3_backup_key, str(_db_path))
        logger.info("restored %s from s3://%s/%s", _db_path, settings.s3_backup_bucket, settings.s3_backup_key)
    except Exception as err:  # noqa: BLE001 — genuinely fine to start empty (first run, no backup yet)
        logger.info("no S3 backup restored (%s) — starting from a fresh local database", err)
    finally:
        # A leftover WAL on the local disk is from an earlier process on this
        # same (recycled) instance — e.g. one that crashed before its own
        # writes were checkpointed. The file we just landed on above is
        # always either a fresh post-CHECKPOINT S3 snapshot or nothing, so
        # that WAL is stale either way. Replaying it re-applies DDL (like
        # CREATE TABLE) that's already reflected in the restored file and
        # crashes startup with a "table already exists" error.
        wal_path = _db_path.with_name(_db_path.name + ".wal")
        wal_path.unlink(missing_ok=True)


def backup_to_s3() -> None:
    if not settings.s3_backup_bucket or not _db_path.exists():
        return
    try:
        # DuckDB can hold recent writes in its WAL without them being
        # reflected in the main file on disk yet — uploading the raw file
        # without forcing a checkpoint first can silently back up a snapshot
        # that's missing the very write that triggered this backup.
        con.execute("CHECKPOINT")
        _s3_client().upload_file(str(_db_path), settings.s3_backup_bucket, settings.s3_backup_key)
    except Exception:  # noqa: BLE001 — a missed backup shouldn't crash the request/loop that triggered it
        logger.exception("S3 backup failed")


async def backup_loop() -> None:
    """Runs for the lifetime of the app (see main.py) — periodic safety net
    against the container disappearing without warning between requests."""
    import asyncio
    while True:
        await asyncio.sleep(settings.s3_backup_interval_seconds)
        backup_to_s3()


_db_path.parent.mkdir(parents=True, exist_ok=True)
restore_from_s3()
try:
    con = duckdb.connect(str(_db_path))
except duckdb.duckdb.CatalogException:
    # Belt-and-suspenders alongside restore_from_s3()'s proactive cleanup:
    # if a WAL still conflicts with the file we just opened (e.g. it
    # reappeared between that cleanup and this connect, or App Runner
    # retried this instance's entrypoint on the same disk without going
    # through restore_from_s3() again), drop it and open clean rather than
    # crash-looping the whole container on every retry.
    wal_path = _db_path.with_name(_db_path.name + ".wal")
    wal_path.unlink(missing_ok=True)
    con = duckdb.connect(str(_db_path))
con.execute(_SCHEMA_PATH.read_text())


def get_db() -> duckdb.DuckDBPyConnection:
    return con
