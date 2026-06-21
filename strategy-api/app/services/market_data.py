"""
Market data service — multi-source price resolution for paper trading.

Price resolution order (fastest → most reliable fallback):
  1. Redis at:market:ltp:token:{token}         set by ws-live.ts every 3 s
  2. Redis at:live:tick:{et}:{token}           raw tick for exchange types 1-5
  3. Redis at:market:quote:{exchange}:{symbol} full OHLCV quote by symbol
  4. Postgres market_quotes.ltp               last persisted live price (ws-live.ts upserts)
  5. Postgres angle_scrip.ltp                 EOD / bhavcopy price

Paper trading NEVER calls Angel One directly for prices.
All price data flows through: Angel One → ws-live.ts → Redis / Postgres → this service.
"""

import json
import logging
from typing import Optional

import asyncpg

from ..redis_client import get_redis

log = logging.getLogger(__name__)


# ── Fast Redis-only lookup (used by limit engine polling loop) ─────────────────

async def get_ltp_by_token(token: str) -> Optional[float]:
    """
    Redis-only price lookup.  Returns None if no live feed data is available.
    Tries the token-keyed LTP key first, then all raw tick exchange types.
    """
    r = get_redis()

    # Primary: token-keyed key written by ws-live.ts on every flush
    val = await r.get(f"at:market:ltp:token:{token}")
    if val:
        try:
            return float(val)
        except (ValueError, TypeError):
            pass

    # Secondary: raw tick by exchange type (1=NSE_CM, 2=NSE_FO, 3=BSE_CM, 4=BSE_FO, 5=MCX_FO)
    for et in (1, 2, 3, 4, 5):
        raw = await r.get(f"at:live:tick:{et}:{token}")
        if raw:
            try:
                tick = json.loads(raw)
                ltp  = tick.get("ltp")
                if ltp is not None:
                    return float(ltp)
            except Exception:
                continue

    return None


# ── Full price resolution with Postgres fallback (used by order placement) ────

async def resolve_price(token: str, conn: asyncpg.Connection) -> Optional[float]:
    """
    Full multi-source price resolution — never returns None if any price exists
    anywhere in Redis or Postgres.

    This is the correct function to call when placing paper orders.
    It ensures orders work whether Angel One is live, disconnected, or during
    off-market hours (using the last known price from Postgres).
    """

    # ── 1 & 2: Redis fast path ─────────────────────────────────────────────────
    ltp = await get_ltp_by_token(token)
    if ltp is not None:
        log.debug("[price] Redis hit for token %s → %.2f", token, ltp)
        return ltp

    # ── 3: Get scrip details from Postgres to try symbol-keyed Redis keys ──────
    scrip = await conn.fetchrow(
        "SELECT symbol, exch_seg, ltp FROM angle_scrip WHERE token=$1",
        token,
    )

    if scrip:
        symbol   = scrip["symbol"]
        exchange = scrip["exch_seg"]

        # Try Redis quote by symbol (e.g. "at:market:quote:NSE:RELIANCE-EQ")
        r   = get_redis()
        raw = await r.get(f"at:market:quote:{exchange}:{symbol}")
        if raw:
            try:
                quote = json.loads(raw)
                ltp   = quote.get("ltp")
                if ltp is not None:
                    log.debug("[price] Redis quote hit for %s %s → %.2f", exchange, symbol, ltp)
                    return float(ltp)
            except Exception:
                pass

        # ── 4: Postgres market_quotes (updated every 3 s by ws-live.ts) ────────
        mq_row = await conn.fetchrow(
            "SELECT ltp FROM market_quotes WHERE symbol=$1 AND exchange=$2",
            symbol, exchange,
        )
        if mq_row and mq_row["ltp"] is not None:
            log.debug("[price] market_quotes hit for %s %s → %.2f", exchange, symbol, float(mq_row["ltp"]))
            return float(mq_row["ltp"])

        # ── 5: angle_scrip.ltp (EOD / bhavcopy price — always available) ───────
        if scrip["ltp"] is not None:
            log.debug("[price] angle_scrip EOD price for token %s → %.2f", token, float(scrip["ltp"]))
            return float(scrip["ltp"])

    log.warning("[price] No price found for token %s in Redis or Postgres", token)
    return None


# ── Full OHLCV quote resolution ───────────────────────────────────────────────

async def resolve_quote(token: str, conn: asyncpg.Connection) -> Optional[dict]:
    """
    Returns a full OHLCV dict for the token.
    Falls back to Postgres if Redis has no live data.
    """
    r = get_redis()

    # Try all exchange types for raw tick
    for et in (1, 2, 3, 4, 5):
        raw = await r.get(f"at:live:tick:{et}:{token}")
        if raw:
            try:
                tick = json.loads(raw)
                if tick.get("ltp"):
                    return tick
            except Exception:
                continue

    # Get scrip and try symbol-keyed Redis quote
    scrip = await conn.fetchrow(
        "SELECT symbol, exch_seg, ltp, open, high, low, close FROM angle_scrip WHERE token=$1",
        token,
    )
    if not scrip:
        return None

    symbol   = scrip["symbol"]
    exchange = scrip["exch_seg"]

    raw = await r.get(f"at:market:quote:{exchange}:{symbol}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass

    # Postgres market_quotes
    row = await conn.fetchrow(
        "SELECT ltp, open, high, low, close, volume FROM market_quotes WHERE symbol=$1 AND exchange=$2",
        symbol, exchange,
    )
    if row and row["ltp"] is not None:
        return {
            "token":    token,
            "symbol":   symbol,
            "exchange": exchange,
            "ltp":      float(row["ltp"]),
            "open":     float(row["open"])  if row["open"]  else None,
            "high":     float(row["high"])  if row["high"]  else None,
            "low":      float(row["low"])   if row["low"]   else None,
            "close":    float(row["close"]) if row["close"] else None,
            "volume":   int(row["volume"])  if row["volume"] else None,
        }

    # angle_scrip EOD prices as final fallback
    if scrip["ltp"] is not None:
        return {
            "token":    token,
            "symbol":   symbol,
            "exchange": exchange,
            "ltp":      float(scrip["ltp"]),
            "open":     float(scrip["open"])  if scrip["open"]  else None,
            "high":     float(scrip["high"])  if scrip["high"]  else None,
            "low":      float(scrip["low"])   if scrip["low"]   else None,
            "close":    float(scrip["close"]) if scrip["close"] else None,
        }

    return None


# ── Scrip search cache helpers ────────────────────────────────────────────────

async def cache_scrip_search(query: str, results: list[dict]) -> None:
    r = get_redis()
    await r.setex(f"scrip:search:{query.lower()}", 3600 * 24, json.dumps(results))


async def get_cached_scrip_search(query: str) -> Optional[list[dict]]:
    r = get_redis()
    raw = await r.get(f"scrip:search:{query.lower()}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return None


async def cache_scrip_detail(token: str, detail: dict) -> None:
    r = get_redis()
    await r.setex(f"scrip:details:{token}", 3600 * 24, json.dumps(detail))


async def get_cached_scrip_detail(token: str) -> Optional[dict]:
    r = get_redis()
    raw = await r.get(f"scrip:details:{token}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return None
