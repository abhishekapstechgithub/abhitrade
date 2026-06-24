"""
Active token watch registry — Redis HSET/HINCRBY pattern.

When the frontend opens a watchlist / option chain for a token,
it increments the counter so the feed worker knows it is actively watched.
When the frontend closes that view, it decrements.

Redis key: active_tokens_registry  (Hash)
  Field: <token>   Value: <int count>

The centralized ws-live.ts feed already subscribes to all tokens in tokens.ts.
This registry is an additional signals layer for the paper trading backend to
prioritise which tokens the limit-order engine should resolve LTPs for.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ...database import get_pool
from ...redis_client import get_redis
from ...dependencies import CurrentUser

router = APIRouter(prefix="/tokens", tags=["token-registry"])

_REGISTRY_KEY = "active_tokens_registry"
_LTP_TTL      = 3600   # 1 hour — matches ws-live.ts flush TTL


class TokenListIn(BaseModel):
    tokens: list[str]   # list of Angel One instrument tokens


@router.post("/watch")
async def watch_tokens(body: TokenListIn, user_id: CurrentUser) -> dict:
    """
    Increment watch counter for each token.
    Call when user opens an option chain, watchlist screen, or chart.

    Redis: HINCRBY active_tokens_registry <token> 1
    """
    if not body.tokens:
        return {"registered": 0}

    r        = get_redis()
    pipeline = r.pipeline()
    for token in body.tokens:
        t = token.strip()
        if t:
            pipeline.hincrby(_REGISTRY_KEY, t, 1)
    await pipeline.execute()

    return {
        "registered": len(body.tokens),
        "tokens":     body.tokens,
        "action":     "watch",
    }


@router.post("/unwatch")
async def unwatch_tokens(body: TokenListIn, user_id: CurrentUser) -> dict:
    """
    Decrement watch counter for each token.
    Tokens with counter <= 0 are removed from the registry.
    Call when user closes the screen / navigates away.
    """
    if not body.tokens:
        return {"unregistered": 0}

    r       = get_redis()
    removed = []
    updated = []

    for token in body.tokens:
        t = token.strip()
        if not t:
            continue
        new_val = await r.hincrby(_REGISTRY_KEY, t, -1)
        if new_val <= 0:
            await r.hdel(_REGISTRY_KEY, t)
            removed.append(t)
        else:
            updated.append(t)

    return {
        "unregistered": len(body.tokens),
        "removed_from_registry": removed,
        "still_active":          updated,
        "action":                "unwatch",
    }


@router.get("/active")
async def get_active_tokens(user_id: CurrentUser) -> dict:
    """
    Returns all tokens currently being watched (count > 0) with their watcher counts.
    Useful for debugging the feed subscription state.
    """
    r   = get_redis()
    raw = await r.hgetall(_REGISTRY_KEY)

    active = {
        token: int(count)
        for token, count in raw.items()
        if int(count) > 0
    }

    return {
        "active_tokens": active,
        "total":         len(active),
    }


@router.get("/ltp")
async def get_token_ltps(tokens: str = Query(..., description="Comma-separated token list")) -> dict:
    """
    GET /api/tokens/ltp?tokens=TOKEN1,TOKEN2,...
    Returns LTP for each token from Redis live feed or angle_scrip EOD fallback.
    No auth required — public price data.
    """
    token_list = [t.strip() for t in tokens.split(",") if t.strip()]
    if not token_list:
        return {"prices": {}}

    r       = get_redis()
    prices  = {}
    missing = []

    # Try Redis live LTP first (at:market:ltp:token:{token} set by ws-live.ts)
    for token in token_list:
        try:
            live = await r.get(f"at:market:ltp:token:{token}")
            if live:
                prices[token] = {"token": token, "ltp": float(live), "change_pct": None, "source": "live"}
            else:
                missing.append(token)
        except Exception:
            missing.append(token)

    # Fallback to angle_scrip EOD prices for tokens not in Redis
    if missing:
        try:
            pool = get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """SELECT token, ltp, close, prev_close, change_pct
                       FROM angle_scrip
                       WHERE token = ANY($1::text[]) AND ltp IS NOT NULL""",
                    missing,
                )
            for row in rows:
                prices[row["token"]] = {
                    "token":      row["token"],
                    "ltp":        float(row["ltp"] or 0),
                    "close":      float(row["close"] or 0)      if row["close"]      else None,
                    "prev_close": float(row["prev_close"] or 0) if row["prev_close"] else None,
                    "change_pct": float(row["change_pct"] or 0) if row["change_pct"] else None,
                    "source":     "eod",
                }
        except Exception as e:
            log.warning("[tokens/ltp] DB fallback error: %s", e)

    return {"prices": prices}
