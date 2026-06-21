"""
Backtest API routes — /api/backtests/*
"""

from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import ORJSONResponse

from ...dependencies import CurrentUser, DBConn
from ...schemas.backtest import BacktestRunRequest, BacktestListParams
from ...schemas.common import paginate
from ...services import backtest_service

router = APIRouter(prefix="/backtests", tags=["backtests"])


def _fmt_job(job: dict) -> dict:
    """Convert a DB row to the camelCase shape the frontend expects."""
    config = {
        "strategyId":      str(job.get("strategy_id", "")),
        "strategyName":    job.get("strategy_name", ""),
        "symbol":          job.get("strategy_symbol", ""),
        "exchange":        job.get("strategy_exchange", "NSE"),
        "fromDate":        str(job.get("from_date", "")),
        "toDate":          str(job.get("to_date", "")),
        "timeframe":       job.get("timeframe", "1D"),
        "initialCapital":  float(job.get("initial_capital", 100_000)),
        "slippagePct":     float(job.get("slippage_pct", 0.05)),
        "brokeragePerLot": float(job.get("brokerage_per_lot", 40)),
        "category":        job.get("strategy_category", "neutral"),
    }

    base: dict = {
        "id":        str(job["id"]),
        "config":    config,
        "status":    job.get("status", "queued"),
        "runAt":     job.get("queued_at", job.get("created_at", "")).isoformat()
                     if hasattr(job.get("queued_at"), "isoformat") else str(job.get("queued_at", "")),
        "durationMs": job.get("duration_ms"),
        "errorMsg":   job.get("error_msg"),
    }

    if job.get("status") == "completed":
        base["metrics"]        = job.get("metrics") or {}
        base["equityCurve"]    = job.get("equity_curve") or []
        base["monthlyReturns"] = job.get("monthly_returns") or []
        # Trades are fetched separately and merged in the service
        raw_trades = job.get("trades") or []
        base["trades"] = [_fmt_trade(t) for t in raw_trades]
    else:
        base["metrics"]        = None
        base["equityCurve"]    = []
        base["monthlyReturns"] = []
        base["trades"]         = []

    return base


def _fmt_trade(t: dict) -> dict:
    return {
        "id":           t.get("id") or t.get("trade_seq", 0),
        "entryDate":    str(t.get("entry_date", "")),
        "exitDate":     str(t.get("exit_date", "")),
        "entryTime":    t.get("entry_time", "09:15"),
        "exitTime":     t.get("exit_time", "15:25"),
        "symbol":       t.get("symbol", ""),
        "side":         t.get("side", "LONG"),
        "entryLevel":   float(t.get("entry_level", 0)),
        "exitLevel":    float(t.get("exit_level", 0)),
        "qty":          int(t.get("qty", 1)),
        "grossPnl":     float(t.get("gross_pnl", 0)),
        "brokerage":    float(t.get("brokerage", 0)),
        "netPnl":       float(t.get("net_pnl", 0)),
        "pnlPct":       float(t.get("pnl_pct", 0)),
        "exitReason":   t.get("exit_reason", "EOD"),
        "holdingMins":  int(t.get("holding_mins", 0)),
        "mfe":          float(t.get("mfe", 0)),
        "mae":          float(t.get("mae", 0)),
    }


# ── POST /backtests/run ────────────────────────────────────────────────────────

@router.post("/run", response_class=ORJSONResponse, status_code=202)
async def run_backtest(
    body:    BacktestRunRequest,
    user_id: CurrentUser,
    conn:    DBConn,
):
    """
    Enqueue a backtest. Returns immediately with the job ID.
    Poll GET /backtests/{jobId} for the result.
    """
    job = await backtest_service.start_backtest(conn, user_id, body)
    return {
        "data": {
            "jobId":    str(job["id"]),
            "status":   job["status"],
            "queuedAt": job["queued_at"].isoformat() if hasattr(job.get("queued_at"), "isoformat")
                        else str(job.get("queued_at", "")),
            "estimatedSecs": 5,
        }
    }


# ── GET /backtests ─────────────────────────────────────────────────────────────

@router.get("", response_class=ORJSONResponse)
async def list_backtests(
    user_id:    CurrentUser,
    conn:       DBConn,
    strategyId: UUID | None = Query(None),
    status:     str         = Query("all"),
    page:       int         = Query(1, ge=1),
    pageSize:   int         = Query(20, ge=1, le=100),
    sortBy:     str         = Query("runAt"),
    order:      str         = Query("desc"),
):
    params = BacktestListParams(
        strategy_id=strategyId,
        status=status,      # type: ignore[arg-type]
        page=page,
        page_size=pageSize,
        sort_by=sortBy,     # type: ignore[arg-type]
        order=order,        # type: ignore[arg-type]
    )
    rows, total = await backtest_service.list_results(conn, user_id, params)
    return {
        "data": [_fmt_job(r) for r in rows],
        "meta": paginate(total, page, pageSize).model_dump(),
    }


# ── GET /backtests/{jobId} ─────────────────────────────────────────────────────

@router.get("/{job_id}", response_class=ORJSONResponse)
async def get_backtest(
    job_id:  UUID,
    user_id: CurrentUser,
    conn:    DBConn,
):
    """
    Poll this endpoint until status is 'completed' or 'failed'.
    When completed, the full result (metrics, equity curve, trades) is returned.
    """
    job = await backtest_service.get_result(conn, job_id, user_id)
    return {"data": _fmt_job(job)}


# ── DELETE /backtests/{jobId} ──────────────────────────────────────────────────

@router.delete("/{job_id}", status_code=204)
async def delete_backtest(
    job_id:  UUID,
    user_id: CurrentUser,
    conn:    DBConn,
):
    await backtest_service.delete_result(conn, job_id, user_id)


# ── POST /backtests/compare ────────────────────────────────────────────────────

@router.post("/compare", response_class=ORJSONResponse)
async def compare_backtests(
    user_id: CurrentUser,
    conn:    DBConn,
    jobIdA:  UUID = Query(...),
    jobIdB:  UUID = Query(...),
):
    result = await backtest_service.compare_results(conn, jobIdA, jobIdB, user_id)
    return {
        "data": {
            "a":      _fmt_job(result["a"]),
            "b":      _fmt_job(result["b"]),
            "deltas": result["deltas"],
        }
    }
