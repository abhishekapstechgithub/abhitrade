"""Scrip search — Redis-first with Postgres fallback. 24 h TTL cache."""

from fastapi import APIRouter, Query

from ...database import get_pool
from ...services.market_data import (
    get_cached_scrip_search, cache_scrip_search, cache_scrip_detail,
)

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
