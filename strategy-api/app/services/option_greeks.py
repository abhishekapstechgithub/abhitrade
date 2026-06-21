"""
Option Greeks service — fetches from Angel One's SmartAPI and caches in Redis + Postgres.

Flow:
  1. Redis hit  → return cached JSON immediately (5-min TTL during market hours)
  2. Redis miss → call Angel One optionGreek endpoint
  3. Upsert results into option_greeks_cache table
  4. Store in Redis, return to caller

Angel One endpoint: POST https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/optionGreek
"""

import json
import logging
from datetime import datetime, date
from typing import Optional

import aiohttp
import asyncpg
import pytz

from ..redis_client import get_redis
from ..exceptions import AppError

log  = logging.getLogger(__name__)
_IST = pytz.timezone("Asia/Kolkata")

ANGEL_GREEKS_URL = (
    "https://apiconnect.angelone.in/rest/secure/angelbroking/"
    "marketData/v1/optionGreek"
)


def _is_market_open() -> bool:
    now = datetime.now(_IST)
    if now.weekday() >= 5:
        return False
    t = now.hour * 60 + now.minute
    return 9 * 60 + 15 <= t <= 15 * 60 + 30


def _greeks_cache_key(name: str, expiry: str) -> str:
    return f"options:greeks:{name.upper()}:{expiry}"


async def _get_angel_access_token() -> str | None:
    """
    Reads the cached AngelOne session token from Redis (set by ws-live.ts auth).
    Returns None instead of raising if session is missing — callers fall back to Postgres.
    """
    r = get_redis()
    raw = await r.get("at:market:session")
    if not raw:
        return None
    try:
        sess  = json.loads(raw)
        token = sess.get("accessToken") or sess.get("access_token")
        return token or None
    except Exception:
        return None


async def _upsert_greeks(
    conn: asyncpg.Connection,
    underlying: str,
    expiry_date: date,
    records: list[dict],
) -> None:
    """Bulk-upsert Greek records into option_greeks_cache."""
    if not records:
        return

    # Delete stale rows for this underlying + expiry before re-inserting
    await conn.execute(
        "DELETE FROM option_greeks_cache WHERE underlying_name=$1 AND expiry=$2",
        underlying, expiry_date,
    )

    rows = []
    for r in records:
        try:
            rows.append((
                underlying,
                expiry_date,
                float(r.get("strikePrice", 0) or 0),
                str(r.get("optionType", "CE")).upper()[:2],
                _safe_float(r.get("delta")),
                _safe_float(r.get("gamma")),
                _safe_float(r.get("theta")),
                _safe_float(r.get("vega")),
                _safe_float(r.get("impliedVolatility")),
                _safe_float(r.get("tradeVolume")),
                _safe_float(r.get("ltp")),
            ))
        except Exception:
            continue

    if rows:
        await conn.executemany(
            """INSERT INTO option_greeks_cache
               (underlying_name, expiry, strike_price, option_type,
                delta, gamma, theta, vega, implied_volatility, trade_volume, ltp)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
            rows,
        )

    log.info("[greeks] Upserted %d rows for %s %s", len(rows), underlying, expiry_date)


def _safe_float(val) -> Optional[float]:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


async def get_option_greeks(
    underlying: str,
    expiry_date_str: str,
    conn: asyncpg.Connection,
) -> list[dict]:
    """
    Main entry point.  Returns a list of option Greek dicts.
    underlying:      e.g. "NIFTY", "TCS"
    expiry_date_str: e.g. "25JAN2024" (Angel One format)
    """
    cache_key = _greeks_cache_key(underlying, expiry_date_str)
    r         = get_redis()

    # ── 1. Redis cache hit ────────────────────────────────────────────────────
    cached = await r.get(cache_key)
    if cached:
        try:
            data = json.loads(cached)
            log.debug("[greeks] Cache HIT for %s", cache_key)
            return data
        except Exception:
            pass

    log.info("[greeks] Cache MISS for %s %s", underlying, expiry_date_str)

    # ── 2. Try Postgres first (fast, no external call needed) ─────────────────
    try:
        expiry_obj     = _parse_expiry(expiry_date_str)
        db_rows        = await get_greeks_from_db(conn, underlying, expiry_obj)
        if db_rows:
            log.info("[greeks] Serving %d rows from Postgres for %s %s", len(db_rows), underlying, expiry_date_str)
            ttl = 300 if _is_market_open() else 3600
            try:
                await r.setex(cache_key, ttl, json.dumps(db_rows))
            except Exception:
                pass
            return db_rows
    except Exception as e:
        log.debug("[greeks] Postgres fallback attempt failed: %s", e)

    # ── 3. Call Angel One SmartAPI (only if session available) ───────────────
    access_token = await _get_angel_access_token()
    if not access_token:
        raise AppError(
            f"No cached Greeks data for {underlying} {expiry_date_str} in Postgres, "
            "and Angel One session is not active. "
            "Wait for market open or load option chain data first.",
            status_code=503, code="NO_DATA",
        )

    timeout = aiohttp.ClientTimeout(total=15)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                ANGEL_GREEKS_URL,
                headers={
                    "Authorization":    f"Bearer {access_token}",
                    "Content-Type":     "application/json",
                    "Accept":           "application/json",
                    "X-UserType":       "USER",
                    "X-SourceID":       "WEB",
                    "X-ClientLocalIP":  "127.0.0.1",
                    "X-ClientPublicIP": "127.0.0.1",
                    "X-MACAddress":     "00:00:00:00:00:00",
                    "X-PrivateKey":     access_token,
                },
                json={"name": underlying, "expirydate": expiry_date_str},
            ) as resp:
                body = await resp.json(content_type=None)
    except aiohttp.ClientError as e:
        raise AppError(f"Angel One API unreachable: {e}", status_code=502, code="EXTERNAL_TIMEOUT")

    if not body.get("status") or not body.get("data"):
        msg = body.get("message", "No data returned")
        raise AppError(f"Angel One greeks API: {msg}", status_code=502, code="EXTERNAL_API_ERROR")

    records: list[dict] = body["data"]

    # ── 4. Upsert into Postgres ───────────────────────────────────────────────
    try:
        expiry_for_upsert = _parse_expiry(expiry_date_str)
        await _upsert_greeks(conn, underlying.upper(), expiry_for_upsert, records)
    except Exception as e:
        log.warning("[greeks] Postgres upsert failed (non-fatal): %s", e)

    # ── 5. Cache in Redis ─────────────────────────────────────────────────────
    # 5-minute TTL during market hours; 1-hour otherwise
    ttl = 300 if _is_market_open() else 3600
    try:
        await r.setex(cache_key, ttl, json.dumps(records))
    except Exception as e:
        log.warning("[greeks] Redis cache write failed: %s", e)

    return records


def _parse_expiry(s: str) -> date:
    """Parse '25JAN2024' or '2024-01-25' or '25-01-2024' → date."""
    for fmt in ("%d%b%Y", "%Y-%m-%d", "%d-%m-%Y", "%d%b%y"):
        try:
            return datetime.strptime(s.strip().upper(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse expiry date: {s!r}")


async def get_greeks_from_db(
    conn: asyncpg.Connection,
    underlying: str,
    expiry_date: date,
) -> list[dict]:
    """Read Greeks from Postgres (used for off-hours fallback or audit)."""
    rows = await conn.fetch(
        """SELECT strike_price, option_type, delta, gamma, theta, vega,
                  implied_volatility, trade_volume, ltp, updated_at
           FROM option_greeks_cache
           WHERE underlying_name=$1 AND expiry=$2
           ORDER BY strike_price, option_type""",
        underlying.upper(), expiry_date,
    )
    return [dict(r) for r in rows]
