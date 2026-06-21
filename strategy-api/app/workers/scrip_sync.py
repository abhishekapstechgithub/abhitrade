"""
Daily Angel One instrument master sync.
Downloads the open-access JSON from Angel One's CDN at 08:30 IST on weekdays.

Locking: uses a Redis key (scrip_sync:lock) with a 30-minute TTL so that
only one uvicorn worker ever runs a sync at a time — safe with --workers 2+.
"""

import asyncio
import io
import logging
from datetime import datetime, timedelta, date

import aiohttp
import ijson
import pytz

from ..database import get_pool
from ..redis_client import get_redis

log = logging.getLogger(__name__)

_IST = pytz.timezone("Asia/Kolkata")
ANGEL_ONE_SCRIP_URL = (
    "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
)
_LOCK_KEY = "scrip_sync:lock"
_LOCK_TTL = 1800  # 30 minutes — enough for the full download + upsert


async def _acquire_lock() -> bool:
    """Returns True if this worker acquired the sync lock, False if another worker holds it."""
    r = get_redis()
    result = await r.set(_LOCK_KEY, "1", nx=True, ex=_LOCK_TTL)
    return result is True


async def _release_lock() -> None:
    r = get_redis()
    await r.delete(_LOCK_KEY)


async def sync_scrip_master() -> int:
    """Download and upsert the Angel One instrument master. Returns number of rows upserted."""
    if not await _acquire_lock():
        log.info("[scrip-sync] Another worker is already syncing — skipping")
        return 0

    try:
        return await _do_sync()
    finally:
        await _release_lock()


def _parse_row(r: dict) -> tuple | None:
    """Convert one instrument record to a DB row tuple. Returns None on error."""
    try:
        expiry: date | None = None
        expiry_raw = (r.get("expiry") or "").strip()
        if expiry_raw:
            for fmt in ("%d%b%Y", "%Y-%m-%d", "%d-%m-%Y"):
                try:
                    expiry = datetime.strptime(expiry_raw, fmt).date()
                    break
                except ValueError:
                    continue

        strike_raw = r.get("strike")
        strike = float(strike_raw) / 100 if strike_raw else 0.0

        return (
            str(r.get("token", "")),
            str(r.get("symbol", "")),
            str(r.get("name", "")),
            expiry,
            strike,
            int(r.get("lotsize", 1) or 1),
            str(r.get("instrumenttype", "")),
            str(r.get("exch_seg", "")),
            float(r.get("tick_size", 0.05) or 0.05),
            int(r.get("freeze_qty", 0) or 0),
        )
    except Exception:
        return None


_UPSERT_SQL = """
    INSERT INTO angle_scrip
       (token, symbol, name, expiry, strike, lotsize, instrumenttype,
        exch_seg, tick_size, freeze_qty)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (token) DO UPDATE SET
      symbol=EXCLUDED.symbol,
      name=EXCLUDED.name,
      expiry=EXCLUDED.expiry,
      strike=EXCLUDED.strike,
      lotsize=EXCLUDED.lotsize,
      instrumenttype=EXCLUDED.instrumenttype,
      exch_seg=EXCLUDED.exch_seg,
      tick_size=EXCLUDED.tick_size,
      freeze_qty=EXCLUDED.freeze_qty,
      loaded_at=NOW()
"""


async def _do_sync() -> int:
    log.info("[scrip-sync] Downloading AngelOne instrument master…")

    # Stream response into a BytesIO buffer — avoids holding both raw bytes
    # and parsed Python dicts in memory at the same time.
    buf = io.BytesIO()
    try:
        timeout = aiohttp.ClientTimeout(total=300)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(ANGEL_ONE_SCRIP_URL) as resp:
                resp.raise_for_status()
                async for chunk in resp.content.iter_chunked(65_536):
                    buf.write(chunk)
    except Exception as e:
        log.error("[scrip-sync] Download failed: %s", e)
        return 0

    buf.seek(0)
    log.info("[scrip-sync] Downloaded %.1f MB — stream-parsing…", buf.tell() / 1_048_576)

    pool  = get_pool()
    count = 0
    batch: list[tuple] = []
    BATCH_SIZE = 500

    # ijson parses the JSON array item-by-item — never holds the full list in memory
    try:
        for r in ijson.items(buf, "item"):
            row = _parse_row(r)
            if row:
                batch.append(row)

            if len(batch) >= BATCH_SIZE:
                async with pool.acquire() as conn:
                    await conn.executemany(_UPSERT_SQL, batch)
                count += len(batch)
                batch = []
                await asyncio.sleep(0)  # yield event loop between batches
    except Exception as e:
        log.error("[scrip-sync] Parse/upsert error: %s", e)
        return count

    # Flush remaining rows
    if batch:
        async with pool.acquire() as conn:
            await conn.executemany(_UPSERT_SQL, batch)
        count += len(batch)

    log.info("[scrip-sync] Upserted %d instruments", count)
    return count


async def run_daily_scrip_sync() -> None:
    """Runs the scrip sync at 08:30 IST on weekdays. No startup sync — use the manual button."""
    log.info("[scrip-sync] Scheduler started — will sync at 08:30 IST on weekdays")

    while True:
        now    = datetime.now(_IST)
        target = now.replace(hour=8, minute=30, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)

        # Skip weekends
        while target.weekday() >= 5:
            target += timedelta(days=1)

        delay = (target - datetime.now(_IST)).total_seconds()
        log.info("[scrip-sync] Next sync in %.0f s at %s", delay, target.isoformat())
        await asyncio.sleep(max(delay, 60))

        if datetime.now(_IST).weekday() < 5:
            try:
                await sync_scrip_master()
            except Exception as e:
                log.error("[scrip-sync] Scheduled sync error: %s", e)
