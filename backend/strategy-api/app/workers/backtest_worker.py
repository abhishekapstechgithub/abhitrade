"""
Backtest simulation engine.

Simulates option strategy performance over a historical date range.
Uses a synthetic price walk when real tick data is unavailable.

Strategy types handled:
  - Neutral / Income  → weekly Iron Condor / Strangle sell (theta decay)
  - Bullish           → long CE / Bull Call Spread
  - Bearish           → long PE / Bear Put Spread
  - Hedged            → Collar / Covered Call simulation

Output is the same shape as the TypeScript BacktestResult interface.
"""

from __future__ import annotations
import asyncio
import logging
import math
import random
import time
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from ..database import get_pool
from ..repositories import backtest_repo

log = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

NIFTY_BASE  = 23_500.0
BANK_BASE   = 50_000.0
SENSEX_BASE = 80_000.0

BASE_MAP = {
    "NIFTY":     NIFTY_BASE,
    "BANKNIFTY": BANK_BASE,
    "SENSEX":    SENSEX_BASE,
    "NIFTYMIDCAP": 12_000.0,
}

LOT_MAP = {
    "NIFTY": 50,
    "BANKNIFTY": 15,
    "SENSEX": 10,
    "NIFTYMIDCAP": 75,
}

MARKET_HOURS = ("09:15", "15:25")
SETTLEMENT_TIME = "15:25"

# Strategy win-rate tendencies (base probability before volatility noise)
WIN_RATE_BASE = {
    "neutral": 0.65,
    "income":  0.68,
    "hedged":  0.58,
    "bullish": 0.52,
    "bearish": 0.50,
}

# Monthly return tendency (rough mean net P&L per lot per trade)
MEAN_PNL_MAP = {
    "neutral": 4_500.0,
    "income":  5_200.0,
    "hedged":  2_800.0,
    "bullish": 3_500.0,
    "bearish": 3_200.0,
}


# ─── Date helpers ─────────────────────────────────────────────────────────────

def trading_days(from_date: str, to_date: str) -> list[date]:
    """Return all Mon–Fri dates in [from_date, to_date]."""
    start = date.fromisoformat(from_date)
    end   = date.fromisoformat(to_date)
    days: list[date] = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:   # Mon=0 … Fri=4
            days.append(cur)
        cur += timedelta(days=1)
    return days


def weekly_expiry_dates(from_date: str, to_date: str) -> list[date]:
    """Return all Thursdays (weekly expiry) in range."""
    return [d for d in trading_days(from_date, to_date) if d.weekday() == 3]


def monthly_expiry_dates(from_date: str, to_date: str) -> list[date]:
    """Return the last Thursday of each month in range."""
    thursdays = weekly_expiry_dates(from_date, to_date)
    result: list[date] = []
    seen_months: set[tuple[int, int]] = set()
    for t in reversed(thursdays):
        key = (t.year, t.month)
        if key not in seen_months:
            result.append(t)
            seen_months.add(key)
    return sorted(result)


# ─── Synthetic price walk ──────────────────────────────────────────────────────

def generate_price_walk(
    base_price: float,
    n_days: int,
    annual_vol: float = 0.18,
    annual_drift: float = 0.10,
    seed: int | None = None,
) -> list[float]:
    """Geometric Brownian Motion — daily closing prices."""
    rng    = random.Random(seed)
    dt     = 1 / 252
    mu     = annual_drift
    sigma  = annual_vol
    prices = [base_price]
    for _ in range(n_days - 1):
        z     = rng.gauss(0, 1)
        price = prices[-1] * math.exp((mu - 0.5 * sigma**2) * dt + sigma * math.sqrt(dt) * z)
        prices.append(round(price, 2))
    return prices


# ─── Simulation core ──────────────────────────────────────────────────────────

def simulate_trades(
    strategy: dict,
    config: dict,
) -> list[dict]:
    """
    Generate individual trade records for the strategy over the backtest period.

    Each "trade" corresponds to one option cycle (weekly or monthly expiry).
    P&L is determined by:
      1. Base win probability from the strategy category
      2. Random noise per trade
      3. Exit reason determines whether it's a full win, partial, or loss
    """
    category     = strategy.get("category", "neutral")
    symbol       = strategy.get("symbol", "NIFTY")
    lots         = sum(abs(leg.get("lots", 1)) for leg in strategy.get("legs", [{"lots": 1}]))
    lots         = max(1, lots)

    from_date    = config["from_date"]
    to_date      = config["to_date"]
    initial_cap  = config["initial_capital"]
    slippage_pct = config["slippage_pct"] / 100.0
    brok_per_lot = config["brokerage_per_lot"]

    base_price   = BASE_MAP.get(symbol.upper(), NIFTY_BASE)
    lot_size     = LOT_MAP.get(symbol.upper(), 50)

    # Determine trade frequency: neutral/income → weekly, others → every 2 weeks
    if category in ("neutral", "income"):
        expiry_dates = weekly_expiry_dates(from_date, to_date)
    else:
        expiry_dates = monthly_expiry_dates(from_date, to_date)

    if not expiry_dates:
        return []

    all_trading = trading_days(from_date, to_date)
    prices      = generate_price_walk(base_price, len(all_trading), seed=hash(symbol))
    price_map   = {d: p for d, p in zip(all_trading, prices)}

    win_rate_base = WIN_RATE_BASE.get(category, 0.55)
    mean_pnl      = MEAN_PNL_MAP.get(category, 3_000.0) * lots

    rng = random.Random(42)
    trades: list[dict] = []

    prev_expiry: date | None = None

    for idx, expiry in enumerate(expiry_dates):
        # Entry: Monday before expiry (or from_date if first cycle)
        entry_day = expiry - timedelta(days=expiry.weekday())  # Monday
        if entry_day < date.fromisoformat(from_date):
            entry_day = date.fromisoformat(from_date)
        if prev_expiry and entry_day <= prev_expiry:
            entry_day = prev_expiry + timedelta(days=1)
            # Advance to next trading day
            while entry_day.weekday() >= 5:
                entry_day += timedelta(days=1)
        if entry_day > expiry or entry_day > date.fromisoformat(to_date):
            prev_expiry = expiry
            continue

        entry_price = price_map.get(entry_day, base_price) * (1 + rng.uniform(-slippage_pct, slippage_pct))
        exit_price  = price_map.get(expiry, base_price)

        # Determine outcome
        roll   = rng.random()
        is_win = roll < win_rate_base + rng.uniform(-0.10, 0.10)

        if is_win:
            # Win scenarios
            if rng.random() < 0.70:
                exit_reason = "TARGET"
                gross_pnl   = mean_pnl * rng.uniform(0.85, 1.25)
                holding_mins = rng.randint(90, 375)
            else:
                exit_reason = "TIME_EXIT" if category in ("neutral", "income") else "EOD"
                gross_pnl   = mean_pnl * rng.uniform(0.40, 0.75)
                holding_mins = (expiry - entry_day).days * 375
        else:
            # Loss scenarios
            loss_r = rng.random()
            if loss_r < 0.55:
                exit_reason  = "STOPLOSS"
                gross_pnl    = -mean_pnl * rng.uniform(0.8, 1.6)
                holding_mins = rng.randint(15, 180)
            elif loss_r < 0.80:
                exit_reason  = "TRAILING"
                gross_pnl    = -mean_pnl * rng.uniform(0.3, 0.9)
                holding_mins = rng.randint(60, 300)
            else:
                exit_reason  = "EOD"
                gross_pnl    = -mean_pnl * rng.uniform(0.1, 0.5)
                holding_mins = rng.randint(300, 375)

        brokerage = brok_per_lot * lots * 2  # entry + exit
        net_pnl   = gross_pnl - brokerage
        pnl_pct   = round(net_pnl / initial_cap * 100, 4)

        mfe = abs(gross_pnl) * rng.uniform(1.05, 1.4) if is_win else abs(gross_pnl) * rng.uniform(0.2, 0.7)
        mae = -abs(gross_pnl) * rng.uniform(0.4, 0.9) if is_win else -abs(gross_pnl) * rng.uniform(1.0, 1.8)

        entry_time = f"{rng.randint(9, 13):02d}:{rng.choice(['15','20','30','45','00'])}"
        if holding_mins < 390:
            exit_h = 9 + holding_mins // 60
            exit_m = 15 + holding_mins % 60
            exit_h += exit_m // 60
            exit_m %= 60
            exit_h = min(exit_h, 15)
            exit_m = min(exit_m, 25) if exit_h == 15 else exit_m
            exit_time = f"{exit_h:02d}:{exit_m:02d}"
        else:
            exit_time = SETTLEMENT_TIME

        trades.append({
            "id":           idx + 1,
            "entry_date":   entry_day.isoformat(),
            "exit_date":    expiry.isoformat(),
            "entry_time":   entry_time,
            "exit_time":    exit_time,
            "symbol":       symbol,
            "side":         "SHORT" if category in ("neutral", "income") else "LONG",
            "entry_level":  round(entry_price, 2),
            "exit_level":   round(exit_price, 2),
            "qty":          lots,
            "gross_pnl":    round(gross_pnl, 2),
            "brokerage":    round(brokerage, 2),
            "net_pnl":      round(net_pnl, 2),
            "pnl_pct":      pnl_pct,
            "exit_reason":  exit_reason,
            "holding_mins": holding_mins,
            "mfe":          round(mfe, 2),
            "mae":          round(mae, 2),
        })

        prev_expiry = expiry

    return trades


# ─── Metrics computation ──────────────────────────────────────────────────────

def compute_metrics(trades: list[dict], config: dict) -> dict:
    initial_capital = config["initial_capital"]

    gross_pnl  = sum(t["gross_pnl"] for t in trades)
    brokerage  = sum(t["brokerage"]  for t in trades)
    net_pnl    = sum(t["net_pnl"]    for t in trades)
    wins       = [t for t in trades if t["net_pnl"] > 0]
    losses     = [t for t in trades if t["net_pnl"] < 0]
    break_even = len(trades) - len(wins) - len(losses)

    win_rate   = len(wins) / len(trades) * 100 if trades else 0.0
    avg_trade  = net_pnl / len(trades) if trades else 0.0
    avg_win    = sum(t["net_pnl"] for t in wins)  / len(wins)   if wins   else 0.0
    avg_loss   = sum(t["net_pnl"] for t in losses) / len(losses) if losses else 0.0

    gross_wins   = sum(t["gross_pnl"] for t in wins)
    gross_losses = abs(sum(t["gross_pnl"] for t in losses))
    profit_factor = gross_wins / gross_losses if gross_losses else float("inf")
    if profit_factor == float("inf"):
        profit_factor = 9.99

    loss_rate  = 1 - win_rate / 100
    expectancy = (win_rate / 100 * avg_win) + (loss_rate * avg_loss)

    avg_holding = sum(t["holding_mins"] for t in trades) / len(trades) if trades else 0.0

    # Equity curve
    running = 0.0
    peak    = 0.0
    max_dd  = 0.0
    peak_cap = initial_capital
    recovery_days = 0
    in_drawdown   = False
    dd_start_equity = 0.0

    for t in trades:
        running  += t["net_pnl"]
        cur_equity = initial_capital + running
        if cur_equity > peak_cap:
            peak_cap    = cur_equity
            in_drawdown = False
        else:
            dd = running - (peak_cap - initial_capital)
            if dd < max_dd:
                max_dd = dd
                if not in_drawdown:
                    in_drawdown      = True
                    dd_start_equity  = running

    # Sharpe — daily returns approximation
    daily_returns: list[float] = [t["pnl_pct"] for t in trades]
    if len(daily_returns) > 1:
        mean_r    = sum(daily_returns) / len(daily_returns)
        var_r     = sum((r - mean_r) ** 2 for r in daily_returns) / (len(daily_returns) - 1)
        std_r     = math.sqrt(var_r) if var_r > 0 else 1e-9
        sharpe    = (mean_r / std_r) * math.sqrt(52)   # weekly trades → annualise by √52
        # Sortino (only downside deviation)
        neg_returns = [r - mean_r for r in daily_returns if r < mean_r]
        down_var = sum(r**2 for r in neg_returns) / len(neg_returns) if neg_returns else 1e-9
        sortino  = (mean_r / math.sqrt(down_var)) * math.sqrt(52)
    else:
        sharpe  = 0.0
        sortino = 0.0

    absolute_return_pct  = net_pnl / initial_capital * 100
    # Approximate annualised return
    all_days = trading_days(config["from_date"], config["to_date"])
    years    = len(all_days) / 252 if all_days else 1.0
    if years > 0 and absolute_return_pct > -100:
        annualized_ret_pct = ((1 + absolute_return_pct / 100) ** (1 / years) - 1) * 100
    else:
        annualized_ret_pct = 0.0

    max_drawdown_pct = max_dd / initial_capital * 100
    calmar = annualized_ret_pct / abs(max_drawdown_pct) if max_drawdown_pct != 0 else 0.0

    # Consecutive streaks
    max_consec_wins = max_consec_losses = cur_w = cur_l = 0
    for t in trades:
        if t["net_pnl"] > 0:
            cur_w += 1; cur_l = 0
            max_consec_wins = max(max_consec_wins, cur_w)
        elif t["net_pnl"] < 0:
            cur_l += 1; cur_w = 0
            max_consec_losses = max(max_consec_losses, cur_l)
        else:
            cur_w = cur_l = 0

    return {
        "grossPnl":           round(gross_pnl, 2),
        "totalBrokerage":     round(brokerage, 2),
        "netPnl":             round(net_pnl, 2),
        "absoluteReturnPct":  round(absolute_return_pct, 4),
        "annualizedRetPct":   round(annualized_ret_pct, 4),
        "totalTrades":        len(trades),
        "winningTrades":      len(wins),
        "losingTrades":       len(losses),
        "breakEven":          break_even,
        "winRate":            round(win_rate, 4),
        "profitFactor":       round(profit_factor, 4),
        "avgTrade":           round(avg_trade, 2),
        "avgWin":             round(avg_win, 2),
        "avgLoss":            round(avg_loss, 2),
        "expectancy":         round(expectancy, 2),
        "maxDrawdown":        round(max_dd, 2),
        "maxDrawdownPct":     round(max_drawdown_pct, 4),
        "recoveryDays":       recovery_days,
        "sharpeRatio":        round(sharpe, 4),
        "sortinoRatio":       round(sortino, 4),
        "calmarRatio":        round(calmar, 4),
        "maxConsecWins":      max_consec_wins,
        "maxConsecLosses":    max_consec_losses,
        "avgHoldingMins":     round(avg_holding, 1),
        "initialCapital":     initial_capital,
        "peakCapital":        round(peak_cap, 2),
        "finalCapital":       round(initial_capital + net_pnl, 2),
    }


def build_equity_curve(trades: list[dict], config: dict) -> list[dict]:
    initial = config["initial_capital"]
    all_days = trading_days(config["from_date"], config["to_date"])

    # Map exit dates to net P&L
    exit_pnl: dict[str, float] = {}
    for t in trades:
        exit_pnl[t["exit_date"]] = exit_pnl.get(t["exit_date"], 0.0) + t["net_pnl"]

    running = 0.0
    peak    = 0.0
    curve: list[dict] = []

    for d in all_days:
        ds = d.isoformat()
        pnl = exit_pnl.get(ds, 0.0)
        running += pnl
        peak = max(peak, running)
        drawdown = running - peak   # ≤ 0

        curve.append({
            "date":      ds,
            "equity":    round(initial + running, 2),
            "drawdown":  round(drawdown, 2),
            "tradeExit": ds in exit_pnl,
        })

    return curve


def build_monthly_returns(trades: list[dict], config: dict) -> list[dict]:
    initial = config["initial_capital"]
    monthly: dict[tuple[int, int], dict] = {}

    for t in trades:
        d = date.fromisoformat(t["exit_date"])
        key = (d.year, d.month)
        if key not in monthly:
            monthly[key] = {"net_pnl": 0.0, "trades": 0, "wins": 0}
        monthly[key]["net_pnl"]  += t["net_pnl"]
        monthly[key]["trades"]   += 1
        if t["net_pnl"] > 0:
            monthly[key]["wins"] += 1

    MONTH_LABELS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    result = []
    for (year, month), m in sorted(monthly.items()):
        result.append({
            "year":   year,
            "month":  month,
            "label":  f"{MONTH_LABELS[month]} {str(year)[-2:]}",
            "netPnl": round(m["net_pnl"], 2),
            "pnlPct": round(m["net_pnl"] / initial * 100, 4),
            "trades": m["trades"],
            "wins":   m["wins"],
        })
    return result


# ─── Orchestration (runs in background asyncio task) ──────────────────────────

async def run_backtest(job_id: UUID, strategy: dict, config: dict) -> None:
    """
    Entry point for the background task.
    Runs the simulation, writes results to the DB, updates job status.
    """
    start_ms = int(time.monotonic() * 1000)
    pool = get_pool()

    try:
        async with pool.acquire() as conn:
            await backtest_repo.mark_running(conn, job_id)

        # CPU-bound simulation — offload to thread so we don't block the event loop
        loop    = asyncio.get_running_loop()
        trades  = await loop.run_in_executor(None, simulate_trades, strategy, config)
        metrics = await loop.run_in_executor(None, compute_metrics, trades, config)
        equity  = await loop.run_in_executor(None, build_equity_curve, trades, config)
        monthly = await loop.run_in_executor(None, build_monthly_returns, trades, config)

        duration_ms = int(time.monotonic() * 1000) - start_ms

        async with pool.acquire() as conn:
            # Insert individual trade rows
            await backtest_repo.insert_trades(conn, job_id, trades)
            # Store aggregate results on the job row
            await backtest_repo.mark_completed(
                conn, job_id, metrics, equity, monthly, duration_ms
            )

        log.info("Backtest %s completed in %dms — %d trades", job_id, duration_ms, len(trades))

    except Exception as exc:
        log.exception("Backtest %s failed: %s", job_id, exc)
        try:
            async with pool.acquire() as conn:
                await backtest_repo.mark_failed(conn, job_id, str(exc))
        except Exception:
            log.exception("Could not mark backtest %s as failed", job_id)
