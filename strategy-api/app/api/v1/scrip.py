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


async def _enrich_with_live_ltp(results: list[dict]) -> list[dict]:
    """Overlay Redis live LTP on top of DB (EOD) prices. Non-blocking on miss."""
    r = get_redis()
    for item in results:
        token = item.get("token") or ""
        if not token:
            continue
        try:
            live = await r.get(f"at:market:ltp:token:{token}")
            if live:
                item["ltp"] = float(live)
        except Exception:
            pass
    return results


@router.get("/search")
async def search_scrip(q: str = Query(..., min_length=1, max_length=50)) -> dict:
    query = q.strip().upper()

    cached = await get_cached_scrip_search(query)
    if cached is not None:
        # Enrich cached (EOD) results with live Redis prices before returning
        enriched = await _enrich_with_live_ltp([dict(r) for r in cached])
        return {"results": enriched, "source": "cache"}

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT token, symbol, name, exch_seg, instrumenttype, lotsize, strike, expiry,
                      ltp, open, high, low, close, prev_close, change_pct, ltp_updated_at
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
            "token":           r["token"],
            "symbol":          r["symbol"],
            "name":            r["name"],
            "exchange":        r["exch_seg"],        # mobile reads 'exchange'
            "exch_seg":        r["exch_seg"],        # web compatibility
            "instrumenttype":  r["instrumenttype"],
            "instrument_type": r["instrumenttype"],  # snake_case alias
            "lotsize":         r["lotsize"],
            "strike":          float(r["strike"])         if r["strike"]      else None,
            "expiry":          r["expiry"].isoformat()    if r["expiry"]      else None,
            # EOD price data from bhavcopy (None until first upload)
            "ltp":             float(r["ltp"])            if r["ltp"]         else None,
            "open":            float(r["open"])           if r["open"]        else None,
            "high":            float(r["high"])           if r["high"]        else None,
            "low":             float(r["low"])            if r["low"]         else None,
            "close":           float(r["close"])          if r["close"]       else None,
            "prev_close":      float(r["prev_close"])     if r["prev_close"]  else None,
            "change_pct":      float(r["change_pct"])     if r["change_pct"]  else None,
            "ltp_updated_at":  r["ltp_updated_at"].isoformat() if r["ltp_updated_at"] else None,
        }
        for r in rows
    ]

    # Cache DB (EOD) results before live enrichment
    await cache_scrip_search(query, results)
    for r in results:
        await cache_scrip_detail(r["token"], r)

    # Overlay live Redis LTP (not cached — always fresh)
    results = await _enrich_with_live_ltp(results)

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
