"""Scrip search — Redis-first with Postgres fallback. 24 h TTL cache."""

import logging
from fastapi import APIRouter, Query, BackgroundTasks

from ...database import get_pool
from ...redis_client import get_redis
from ...services.market_data import (
    get_cached_scrip_search, cache_scrip_search, cache_scrip_detail,
)
from ...workers.scrip_sync import sync_scrip_master, _LOCK_KEY

log = logging.getLogger(__name__)

router = APIRouter(prefix="/scrip", tags=["scrip"])


@router.get("/search")
async def search_scrip(q: str = Query(..., min_length=1, max_length=50)) -> dict:
    query = q.strip().upper()

    cached = await get_cached_scrip_search(query)
    if cached is not None:
        return {"results": cached, "source": "cache"}

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT token, symbol, name, exch_seg, instrumenttype, lotsize, strike, expiry
               FROM angle_scrip
               WHERE symbol ILIKE $1 OR name ILIKE $1
               ORDER BY
                 CASE WHEN symbol ILIKE $2 THEN 0 ELSE 1 END,
                 symbol
               LIMIT 15""",
            f"%{query}%",
            f"{query}%",
        )

    results = [
        {
            "token":          r["token"],
            "symbol":         r["symbol"],
            "name":           r["name"],
            "exch_seg":       r["exch_seg"],
            "instrumenttype": r["instrumenttype"],
            "lotsize":        r["lotsize"],
            "strike":         float(r["strike"]) if r["strike"] else None,
            "expiry":         r["expiry"].isoformat() if r["expiry"] else None,
        }
        for r in rows
    ]

    await cache_scrip_search(query, results)
    for r in results:
        await cache_scrip_detail(r["token"], r)

    return {"results": results, "source": "db"}


@router.post("/sync")
async def trigger_scrip_sync(background_tasks: BackgroundTasks) -> dict:
    """Manually trigger Angel One instrument master download + upsert into angle_scrip."""
    r = get_redis()
    if await r.exists(_LOCK_KEY):
        return {"status": "already_running", "message": "Sync already in progress — check back in a minute"}

    async def _run() -> None:
        try:
            count = await sync_scrip_master()
            log.info("[scrip-sync] Manual sync complete — %d instruments upserted", count)
        except Exception as e:
            log.error("[scrip-sync] Manual sync error: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Downloading Angel One instrument master in background…"}


@router.get("/sync/status")
async def scrip_sync_status() -> dict:
    """Returns instrument count, last sync time, and whether a sync is currently running."""
    pool = get_pool()
    r    = get_redis()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) AS total, MAX(loaded_at) AS last_sync FROM angle_scrip"
        )

    sync_running = bool(await r.exists(_LOCK_KEY))

    return {
        "total_instruments": row["total"] or 0,
        "last_sync":         row["last_sync"].isoformat() if row["last_sync"] else None,
        "sync_running":      sync_running,
    }
