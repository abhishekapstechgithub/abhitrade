"""
Backtest service — orchestrates job creation, background task dispatch,
result assembly, and trade retrieval.
"""

from __future__ import annotations
import asyncio
import logging
from uuid import UUID

import asyncpg

from ..repositories import backtest_repo, strategy_repo
from ..schemas.backtest import BacktestRunRequest, BacktestListParams
from ..engine.runner import run_backtest
from ..database import get_pool
from ..exceptions import NotFoundError

log = logging.getLogger(__name__)


async def start_backtest(
    conn: asyncpg.Connection,
    user_id: UUID,
    req: BacktestRunRequest,
) -> dict:
    """
    1. Verify strategy ownership
    2. Create a job row (status = queued)
    3. Fire the simulation as a background task
    4. Return the job immediately (the frontend polls for completion)
    """
    strategy = await strategy_repo.get_by_id(conn, req.strategy_id, user_id)
    if not strategy:
        raise NotFoundError("Strategy")

    job = await backtest_repo.create_job(
        conn,
        user_id=user_id,
        req=req,
        strategy_name=strategy["name"],
        strategy_symbol=strategy["symbol"],
        strategy_exchange=strategy["exchange"],
        strategy_category=strategy["category"],
    )

    config = {
        "symbol":           strategy["symbol"],
        "fromDate":         str(req.from_date),
        "toDate":           str(req.to_date),
        "timeframe":        req.timeframe,
        "initialCapital":   req.initial_capital,
        "slippagePct":      req.slippage_pct,
        "brokeragePerLot":  req.brokerage_per_lot,
        # Strategy type hints for the runner
        "strategyType":     strategy.get("category", "preset"),
        "presetName":       strategy.get("preset_name", "iron_condor"),
        "builderJson":      strategy.get("builder_json") or {},
    }

    job_id_str = str(job["id"])

    async def _run_with_own_conn() -> None:
        pool = get_pool()
        async with pool.acquire() as bg_conn:
            await run_backtest(job_id_str, config, bg_conn)

    asyncio.create_task(
        _run_with_own_conn(),
        name=f"backtest-{job['id']}",
    )

    log.info("Backtest job %s queued for strategy %s", job["id"], req.strategy_id)
    return job


async def get_result(
    conn: asyncpg.Connection,
    job_id: UUID,
    user_id: UUID,
) -> dict:
    """
    Return the full backtest result.
    If the job is still running, returns the job dict with status='running'.
    If completed, assembles the full result including trades.
    """
    job = await backtest_repo.get_job(conn, job_id, user_id)
    if not job:
        raise NotFoundError("Backtest job")

    if job["status"] not in ("completed", "failed"):
        return job

    # Fetch individual trade records from the trades table
    trades = await backtest_repo.get_trades(conn, job_id, user_id)
    job["trades"] = trades
    return job


async def list_results(
    conn: asyncpg.Connection,
    user_id: UUID,
    params: BacktestListParams,
) -> tuple[list[dict], int]:
    rows, total = await backtest_repo.list_jobs(conn, user_id, params)
    return rows, total


async def delete_result(
    conn: asyncpg.Connection,
    job_id: UUID,
    user_id: UUID,
) -> None:
    job = await backtest_repo.get_job(conn, job_id, user_id)
    if not job:
        raise NotFoundError("Backtest job")
    await conn.execute(
        "DELETE FROM backtest_jobs WHERE id = $1 AND user_id = $2",
        job_id, user_id,
    )


async def compare_results(
    conn: asyncpg.Connection,
    job_id_a: UUID,
    job_id_b: UUID,
    user_id: UUID,
) -> dict:
    a = await get_result(conn, job_id_a, user_id)
    b = await get_result(conn, job_id_b, user_id)

    if a["status"] != "completed":
        raise ValueError(f"Job A ({job_id_a}) is not completed")
    if b["status"] != "completed":
        raise ValueError(f"Job B ({job_id_b}) is not completed")

    def delta_entry(metric: str, a_val: float, b_val: float) -> dict:
        d = b_val - a_val
        better: str
        if abs(d) < 0.0001:
            better = "equal"
        else:
            # Higher is better for most metrics; lower is better for drawdown
            if metric in ("maxDrawdown", "maxDrawdownPct", "avgLoss"):
                better = "a" if a_val > b_val else "b"
            else:
                better = "b" if b_val > a_val else "a"
        return {"metric": metric, "a": a_val, "b": b_val, "delta": round(d, 4), "better": better}

    metrics_a = a.get("metrics", {})
    metrics_b = b.get("metrics", {})
    compare_fields = [
        "netPnl", "winRate", "profitFactor", "sharpeRatio",
        "maxDrawdown", "avgTrade", "expectancy", "calmarRatio",
    ]
    deltas = [
        delta_entry(f, metrics_a.get(f, 0), metrics_b.get(f, 0))
        for f in compare_fields
    ]

    return {"a": a, "b": b, "deltas": deltas}
