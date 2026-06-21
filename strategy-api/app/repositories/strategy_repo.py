"""
Strategy repository — all SQL for the `strategies` table.

Returns raw dicts from asyncpg rows; the service layer converts to schemas.
No business logic here — only SQL and row mapping.
"""

from __future__ import annotations
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg

from ..schemas.strategy import (
    CreateStrategyRequest,
    UpdateStrategyRequest,
    StrategyListParams,
)


# ─── Internal SQL helpers ─────────────────────────────────────────────────────

_SELECT = """
    SELECT
        id, user_id, name, symbol, exchange, category, status,
        legs, max_profit, max_loss, breakeven_low, breakeven_high,
        net_premium, tags, notes, builder_json,
        deployed_at, basket_id, created_at, updated_at
    FROM strategies
"""


def _row_to_dict(row: asyncpg.Record) -> dict:
    d = dict(row)
    # asyncpg returns JSONB as Python objects (dict/list) after our codec setup
    if isinstance(d.get("legs"), str):
        d["legs"] = json.loads(d["legs"])
    if isinstance(d.get("builder_json"), str):
        d["builder_json"] = json.loads(d["builder_json"])
    return d


# ─── Public functions ─────────────────────────────────────────────────────────

async def count(
    conn: asyncpg.Connection,
    user_id: UUID,
    params: StrategyListParams,
) -> int:
    sql, args = _build_where(user_id, params, count_only=True)
    return await conn.fetchval(sql, *args)


async def list_strategies(
    conn: asyncpg.Connection,
    user_id: UUID,
    params: StrategyListParams,
) -> list[dict]:
    col_map = {
        "createdAt":  "created_at",
        "updatedAt":  "updated_at",
        "name":       "name",
        "netPremium": "net_premium",
    }
    order_col = col_map.get(params.sort_by, "created_at")
    order_dir = params.order.upper()

    where_sql, args = _build_where(user_id, params)
    offset = (params.page - 1) * params.page_size

    sql = f"""
        {_SELECT}
        WHERE {where_sql}
        ORDER BY {order_col} {order_dir}
        LIMIT ${len(args) + 1} OFFSET ${len(args) + 2}
    """
    rows = await conn.fetch(sql, *args, params.page_size, offset)
    return [_row_to_dict(r) for r in rows]


async def get_by_id(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
) -> dict | None:
    row = await conn.fetchrow(
        f"{_SELECT} WHERE id = $1 AND user_id = $2",
        strategy_id,
        user_id,
    )
    return _row_to_dict(row) if row else None


async def create(
    conn: asyncpg.Connection,
    user_id: UUID,
    data: CreateStrategyRequest,
) -> dict:
    legs_json = json.dumps(
        [leg.model_dump(by_alias=True) for leg in data.legs]
    )
    row = await conn.fetchrow(
        """
        INSERT INTO strategies (
            id, user_id, name, symbol, exchange, category, status,
            legs, max_profit, max_loss, breakeven_low, breakeven_high,
            net_premium, tags, notes, builder_json
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9, $10, $11, $12,
            $13, $14, $15, $16::jsonb
        )
        RETURNING *
        """,
        uuid4(), user_id,
        data.name, data.symbol, data.exchange, data.category, data.status,
        legs_json,
        data.max_profit, data.max_loss, data.breakeven_low, data.breakeven_high,
        data.net_premium,
        data.tags or [],
        data.notes,
        json.dumps(data.builder_json) if data.builder_json else None,
    )
    return _row_to_dict(row)


async def update(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
    data: UpdateStrategyRequest,
) -> dict | None:
    # Build SET clause dynamically from non-None fields
    patches = data.model_dump(
        by_alias=False, exclude_none=True,
        exclude={"builder_json"},
    )
    if data.builder_json is not None:
        patches["builder_json"] = data.builder_json

    if not patches:
        return await get_by_id(conn, strategy_id, user_id)

    set_parts: list[str] = []
    args: list = []

    field_map = {
        "name":           ("name",           None),
        "symbol":         ("symbol",         None),
        "exchange":       ("exchange",        None),
        "category":       ("category",        None),
        "status":         ("status",          None),
        "legs":           ("legs",            "jsonb"),
        "max_profit":     ("max_profit",      None),
        "max_loss":       ("max_loss",        None),
        "breakeven_low":  ("breakeven_low",   None),
        "breakeven_high": ("breakeven_high",  None),
        "net_premium":    ("net_premium",     None),
        "tags":           ("tags",            None),
        "notes":          ("notes",           None),
        "builder_json":   ("builder_json",    "jsonb"),
    }

    for py_field, (col, cast) in field_map.items():
        if py_field not in patches:
            continue
        val = patches[py_field]
        args.append(json.dumps(val) if isinstance(val, (dict, list)) else val)
        idx = len(args)
        set_parts.append(f"{col} = ${idx}{'::jsonb' if cast else ''}")

    args.extend([strategy_id, user_id])
    n = len(args)

    row = await conn.fetchrow(
        f"""
        UPDATE strategies
        SET {', '.join(set_parts)}, updated_at = NOW()
        WHERE id = ${n - 1} AND user_id = ${n}
        RETURNING *
        """,
        *args,
    )
    return _row_to_dict(row) if row else None


async def delete(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
) -> bool:
    result = await conn.execute(
        "DELETE FROM strategies WHERE id = $1 AND user_id = $2",
        strategy_id, user_id,
    )
    return result == "DELETE 1"


async def mark_deployed(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
    basket_id: str,
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE strategies
        SET status = 'deployed', deployed_at = NOW(), basket_id = $3,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
        """,
        strategy_id, user_id, basket_id,
    )
    return _row_to_dict(row) if row else None


async def get_all_tags(
    conn: asyncpg.Connection,
    user_id: UUID,
) -> list[str]:
    rows = await conn.fetch(
        "SELECT DISTINCT unnest(tags) AS tag FROM strategies WHERE user_id = $1 ORDER BY tag",
        user_id,
    )
    return [r["tag"] for r in rows]


# ─── WHERE clause builder ──────────────────────────────────────────────────────

def _build_where(
    user_id: UUID,
    params: StrategyListParams,
    count_only: bool = False,
) -> tuple[str, list]:
    conditions = ["user_id = $1"]
    args: list = [user_id]

    def add(condition: str, val) -> None:
        args.append(val)
        conditions.append(condition.replace("?", f"${len(args)}"))

    if params.category != "all":
        add("category = ?", params.category)
    if params.status != "all":
        add("status = ?", params.status)
    if params.symbol:
        add("symbol ILIKE ?", f"%{params.symbol}%")
    if params.exchange != "all":
        add("exchange = ?", params.exchange)
    if params.q:
        add("(name ILIKE ? OR $1::text ILIKE ?)", f"%{params.q}%")

    where = " AND ".join(conditions)

    if count_only:
        return f"SELECT COUNT(*) FROM strategies WHERE {where}", args
    return where, args
