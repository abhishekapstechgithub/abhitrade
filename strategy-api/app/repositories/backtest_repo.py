"""
Backtest repository — SQL for backtest_jobs and backtest_trades tables.
"""

from __future__ import annotations
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg

from ..schemas.backtest import BacktestRunRequest, BacktestListParams


def _row_to_dict(row: asyncpg.Record) -> dict:
    d = dict(row)
    for key in ("metrics", "equity_curve", "monthly_returns"):
        if isinstance(d.get(key), str):
            d[key] = json.loads(d[key])
    return d


# ─── Jobs ─────────────────────────────────────────────────────────────────────

async def create_job(
    conn: asyncpg.Connection,
    user_id: UUID,
    req: BacktestRunRequest,
    strategy_name: str,
    strategy_symbol: str,
    strategy_exchange: str,
    strategy_category: str,
) -> dict:
    job_id = uuid4()
    row = await conn.fetchrow(
        """
        INSERT INTO backtest_jobs (
            id, strategy_id, user_id, status,
            from_date, to_date, timeframe,
            initial_capital, slippage_pct, brokerage_per_lot,
            strategy_name, strategy_symbol, strategy_exchange, strategy_category
        ) VALUES (
            $1, $2, $3, 'queued',
            $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13
        )
        RETURNING *
        """,
        job_id, req.strategy_id, user_id,
        req.from_date, req.to_date, req.timeframe,
        req.initial_capital, req.slippage_pct, req.brokerage_per_lot,
        strategy_name, strategy_symbol, strategy_exchange, strategy_category,
    )
    return _row_to_dict(row)


async def get_job(
    conn: asyncpg.Connection,
    job_id: UUID,
    user_id: UUID,
) -> dict | None:
    row = await conn.fetchrow(
        "SELECT * FROM backtest_jobs WHERE id = $1 AND user_id = $2",
        job_id, user_id,
    )
    return _row_to_dict(row) if row else None


async def list_jobs(
    conn: asyncpg.Connection,
    user_id: UUID,
    params: BacktestListParams,
) -> tuple[list[dict], int]:
    conditions = ["user_id = $1"]
    args: list = [user_id]

    def add(cond: str, val) -> None:
        args.append(val)
        conditions.append(cond.replace("?", f"${len(args)}"))

    if params.strategy_id:
        add("strategy_id = ?", params.strategy_id)
    if params.status != "all":
        add("status = ?", params.status)

    where = " AND ".join(conditions)

    col_map = {"runAt": "created_at", "netPnl": "(metrics->>'netPnl')::float", "winRate": "(metrics->>'winRate')::float"}
    order_col = col_map.get(params.sort_by, "created_at")
    order_dir = params.order.upper()
    offset = (params.page - 1) * params.page_size

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM backtest_jobs WHERE {where}", *args
    )

    args_list = args[:]
    rows = await conn.fetch(
        f"""
        SELECT id, strategy_id, user_id, status, from_date, to_date, timeframe,
               initial_capital, slippage_pct, brokerage_per_lot,
               strategy_name, strategy_symbol, strategy_exchange, strategy_category,
               metrics, equity_curve, monthly_returns,
               error_msg, duration_ms, queued_at, started_at, completed_at, created_at
        FROM backtest_jobs
        WHERE {where}
        ORDER BY {order_col} {order_dir}
        LIMIT ${len(args_list) + 1} OFFSET ${len(args_list) + 2}
        """,
        *args_list, params.page_size, offset,
    )
    return [_row_to_dict(r) for r in rows], total


async def mark_running(
    conn: asyncpg.Connection,
    job_id: UUID,
) -> None:
    await conn.execute(
        "UPDATE backtest_jobs SET status = 'running', started_at = NOW() WHERE id = $1",
        job_id,
    )


async def mark_completed(
    conn: asyncpg.Connection,
    job_id: UUID,
    metrics: dict,
    equity_curve: list,
    monthly_returns: list,
    duration_ms: int,
) -> dict | None:
    row = await conn.fetchrow(
        """
        UPDATE backtest_jobs
        SET status        = 'completed',
            metrics       = $2::jsonb,
            equity_curve  = $3::jsonb,
            monthly_returns = $4::jsonb,
            duration_ms   = $5,
            completed_at  = NOW()
        WHERE id = $1
        RETURNING *
        """,
        job_id,
        json.dumps(metrics),
        json.dumps(equity_curve),
        json.dumps(monthly_returns),
        duration_ms,
    )
    return _row_to_dict(row) if row else None


async def mark_failed(
    conn: asyncpg.Connection,
    job_id: UUID,
    error_msg: str,
) -> None:
    await conn.execute(
        """
        UPDATE backtest_jobs
        SET status = 'failed', error_msg = $2, completed_at = NOW()
        WHERE id = $1
        """,
        job_id, error_msg,
    )


# ─── Trades ───────────────────────────────────────────────────────────────────

async def insert_trades(
    conn: asyncpg.Connection,
    job_id: UUID,
    trades: list[dict],
) -> None:
    if not trades:
        return
    await conn.executemany(
        """
        INSERT INTO backtest_trades (
            job_id, trade_seq, entry_date, exit_date, entry_time, exit_time,
            symbol, side, entry_level, exit_level, qty,
            gross_pnl, brokerage, net_pnl, pnl_pct,
            exit_reason, holding_mins, mfe, mae
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19
        )
        """,
        [
            (
                job_id,
                t["id"],
                t["entry_date"],
                t["exit_date"],
                t["entry_time"],
                t["exit_time"],
                t["symbol"],
                t["side"],
                t["entry_level"],
                t["exit_level"],
                t["qty"],
                t["gross_pnl"],
                t["brokerage"],
                t["net_pnl"],
                t["pnl_pct"],
                t["exit_reason"],
                t["holding_mins"],
                t["mfe"],
                t["mae"],
            )
            for t in trades
        ],
    )


async def get_trades(
    conn: asyncpg.Connection,
    job_id: UUID,
    user_id: UUID,
) -> list[dict]:
    rows = await conn.fetch(
        """
        SELECT bt.*
        FROM backtest_trades bt
        JOIN backtest_jobs bj ON bj.id = bt.job_id
        WHERE bt.job_id = $1 AND bj.user_id = $2
        ORDER BY bt.trade_seq
        """,
        job_id, user_id,
    )
    return [dict(r) for r in rows]
