"""
Backtest request/response schemas — mirrors backtest.types.ts exactly.
"""

from __future__ import annotations
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ─── Enumerations ─────────────────────────────────────────────────────────────

BacktestStatus = Literal["queued", "running", "completed", "failed"]
TradeSide      = Literal["LONG", "SHORT"]
ExitReason     = Literal["TARGET", "STOPLOSS", "TRAILING", "TIME_EXIT", "EOD", "SIGNAL"]
Timeframe      = Literal["1m", "5m", "15m", "30m", "1h", "1D", "1W"]


# ─── Run request ──────────────────────────────────────────────────────────────

class BacktestRunRequest(BaseModel):
    strategy_id:       UUID  = Field(alias="strategyId")
    from_date:         str   = Field(alias="fromDate",  pattern=r"^\d{4}-\d{2}-\d{2}$")
    to_date:           str   = Field(alias="toDate",    pattern=r"^\d{4}-\d{2}-\d{2}$")
    timeframe:         Timeframe = Field("1D")
    initial_capital:   float = Field(100_000, alias="initialCapital",   gt=0)
    slippage_pct:      float = Field(0.05,    alias="slippagePct",      ge=0, le=5)
    brokerage_per_lot: float = Field(40.0,    alias="brokeragePerLot",  ge=0)

    model_config = {"populate_by_name": True}


# ─── Job (queued / running state) ─────────────────────────────────────────────

class BacktestJobOut(BaseModel):
    job_id:          UUID     = Field(alias="jobId")
    status:          BacktestStatus
    queued_at:       datetime = Field(alias="queuedAt")
    estimated_secs:  int | None = Field(None, alias="estimatedSecs")

    model_config = {"populate_by_name": True, "from_attributes": True}


# ─── Individual trade record ──────────────────────────────────────────────────

class TradeRecordOut(BaseModel):
    id:            int
    entry_date:    str   = Field(alias="entryDate")
    exit_date:     str   = Field(alias="exitDate")
    entry_time:    str   = Field(alias="entryTime")
    exit_time:     str   = Field(alias="exitTime")
    symbol:        str
    side:          TradeSide
    entry_level:   float = Field(alias="entryLevel")
    exit_level:    float = Field(alias="exitLevel")
    qty:           int
    gross_pnl:     float = Field(alias="grossPnl")
    brokerage:     float
    net_pnl:       float = Field(alias="netPnl")
    pnl_pct:       float = Field(alias="pnlPct")
    exit_reason:   ExitReason  = Field(alias="exitReason")
    holding_mins:  int   = Field(alias="holdingMins")
    mfe:           float
    mae:           float

    model_config = {"populate_by_name": True, "from_attributes": True}


# ─── Equity curve point ────────────────────────────────────────────────────────

class EquityPointOut(BaseModel):
    date:       str
    equity:     float
    drawdown:   float
    trade_exit: bool = Field(alias="tradeExit")

    model_config = {"populate_by_name": True}


# ─── Monthly return ───────────────────────────────────────────────────────────

class MonthlyReturnOut(BaseModel):
    year:    int
    month:   int
    label:   str
    net_pnl: float = Field(alias="netPnl")
    pnl_pct: float = Field(alias="pnlPct")
    trades:  int
    wins:    int

    model_config = {"populate_by_name": True}


# ─── Aggregate metrics ────────────────────────────────────────────────────────

class BacktestMetricsOut(BaseModel):
    # P&L
    gross_pnl:           float = Field(alias="grossPnl")
    total_brokerage:     float = Field(alias="totalBrokerage")
    net_pnl:             float = Field(alias="netPnl")
    absolute_return_pct: float = Field(alias="absoluteReturnPct")
    annualized_ret_pct:  float = Field(alias="annualizedRetPct")
    # Trades
    total_trades:    int   = Field(alias="totalTrades")
    winning_trades:  int   = Field(alias="winningTrades")
    losing_trades:   int   = Field(alias="losingTrades")
    break_even:      int   = Field(alias="breakEven")
    win_rate:        float = Field(alias="winRate")
    # Risk / reward
    profit_factor:   float = Field(alias="profitFactor")
    avg_trade:       float = Field(alias="avgTrade")
    avg_win:         float = Field(alias="avgWin")
    avg_loss:        float = Field(alias="avgLoss")
    expectancy:      float
    # Drawdown
    max_drawdown:     float = Field(alias="maxDrawdown")
    max_drawdown_pct: float = Field(alias="maxDrawdownPct")
    recovery_days:    int   = Field(alias="recoveryDays")
    # Risk-adjusted
    sharpe_ratio:  float = Field(alias="sharpeRatio")
    sortino_ratio: float = Field(alias="sortinoRatio")
    calmar_ratio:  float = Field(alias="calmarRatio")
    # Streaks
    max_consec_wins:   int   = Field(alias="maxConsecWins")
    max_consec_losses: int   = Field(alias="maxConsecLosses")
    avg_holding_mins:  float = Field(alias="avgHoldingMins")
    # Capital
    initial_capital: float = Field(alias="initialCapital")
    peak_capital:    float = Field(alias="peakCapital")
    final_capital:   float = Field(alias="finalCapital")

    model_config = {"populate_by_name": True}


# ─── Config stored with the job ───────────────────────────────────────────────

class BacktestConfigOut(BaseModel):
    strategy_id:   UUID   = Field(alias="strategyId")
    strategy_name: str    = Field(alias="strategyName")
    symbol:        str
    exchange:      str
    from_date:     str    = Field(alias="fromDate")
    to_date:       str    = Field(alias="toDate")
    timeframe:     Timeframe
    initial_capital:   float = Field(alias="initialCapital")
    slippage_pct:      float = Field(alias="slippagePct")
    brokerage_per_lot: float = Field(alias="brokeragePerLot")
    category:          str

    model_config = {"populate_by_name": True}


# ─── Full result ──────────────────────────────────────────────────────────────

class BacktestResultOut(BaseModel):
    id:              UUID
    config:          BacktestConfigOut
    metrics:         BacktestMetricsOut
    equity_curve:    list[EquityPointOut]  = Field(alias="equityCurve")
    monthly_returns: list[MonthlyReturnOut] = Field(alias="monthlyReturns")
    trades:          list[TradeRecordOut]
    run_at:          datetime              = Field(alias="runAt")
    status:          BacktestStatus
    error_msg:       str | None            = Field(None, alias="errorMsg")
    duration_ms:     int | None            = Field(None, alias="durationMs")

    model_config = {"populate_by_name": True, "from_attributes": True}


# ─── List params ──────────────────────────────────────────────────────────────

class BacktestListParams(BaseModel):
    strategy_id: UUID | None  = Field(None, alias="strategyId")
    status:      BacktestStatus | Literal["all"] = "all"
    page:        int = Field(1, ge=1)
    page_size:   int = Field(20, ge=1, le=100, alias="pageSize")
    sort_by:     Literal["runAt", "netPnl", "winRate"] = Field("runAt", alias="sortBy")
    order:       Literal["asc", "desc"] = "desc"

    model_config = {"populate_by_name": True}
