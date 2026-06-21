"""
Async runner — replaces the GBM-only backtest_worker.py.

Dispatched by backtest_service.start_backtest() via asyncio.create_task().

Supports:
  - Preset strategies (iron_condor, bull_call_spread, bear_put_spread, strangle)
  - Builder-JSON compiled strategies
  - GBM feed (default) and CSV feed
"""

from __future__ import annotations
import asyncio
import logging
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import asyncpg

from .data.feed import GBMFeed, CSVFeed
from .data.calendar import trading_days
from .engine import BacktestEngine
from .strategy.presets import IronCondor, BullCallSpread, BearPutSpread, Strangle
from .strategy.builder_parser import BuilderParser

log = logging.getLogger(__name__)

_PRESET_MAP = {
    "iron_condor":     IronCondor,
    "bull_call_spread": BullCallSpread,
    "bear_put_spread":  BearPutSpread,
    "strangle":         Strangle,
}


async def run_backtest(
    job_id:  str,
    config:  dict,
    conn:    "asyncpg.Connection",
) -> None:
    """
    Entry point called by backtest_service via asyncio.create_task().

    config keys (all optional with defaults):
      symbol, from_date, to_date, timeframe,
      initial_capital, slippage_pct, brokerage_per_lot,
      strategy_type ('preset' | 'builder'),
      preset_name, iv, lots, wing_width, expiry_type,
      builder_json (for strategy_type='builder')
    """
    log.info("Backtest %s started — config: %s", job_id, config)

    try:
        # ── 1. Mark running ──────────────────────────────────────────────────
        await conn.execute(
            "UPDATE backtest_jobs SET status='running', started_at=NOW() WHERE id=$1",
            uuid.UUID(job_id),
        )

        # ── 2. Parse config ──────────────────────────────────────────────────
        symbol      = config.get("symbol", "NIFTY")
        from_date   = _parse_date(config.get("fromDate", "2024-01-01"))
        to_date     = _parse_date(config.get("toDate",   "2024-12-31"))
        timeframe   = config.get("timeframe", "1D")
        capital     = float(config.get("initialCapital", 100_000))
        slippage    = float(config.get("slippagePct",    0.05))
        brokerage   = float(config.get("brokeragePerLot", 40.0))

        # ── 3. Fetch candles ─────────────────────────────────────────────────
        feed    = GBMFeed()
        candles = await asyncio.get_event_loop().run_in_executor(
            None, feed.get_candles, symbol, from_date, to_date, timeframe,
        )

        if not candles:
            raise ValueError(f"No candle data returned for {symbol} {from_date}→{to_date}")

        # ── 4. Build strategy ─────────────────────────────────────────────────
        strategy_type = config.get("strategyType", "preset")

        if strategy_type == "builder":
            builder_json = config.get("builderJson", {})
            parser   = BuilderParser()
            strategy = parser.compile(builder_json, candles, capital)
        else:
            preset_name = config.get("presetName", "iron_condor")
            cls = _PRESET_MAP.get(preset_name, IronCondor)

            iv          = float(config.get("iv", 0.14))
            lots        = int(config.get("lots", 1))
            expiry_type = config.get("expiryType", "weekly")
            kwargs = dict(
                symbol=symbol, initial_capital=capital,
                iv=iv, lots=lots, expiry_type=expiry_type,
                slippage_pct=slippage,
            )
            if preset_name == "iron_condor":
                kwargs["wing_width"] = int(config.get("wingWidth", 2))
            strategy = cls(**kwargs)

        # ── 5. Run bar loop ───────────────────────────────────────────────────
        engine  = BacktestEngine(candles, strategy, slippage, brokerage)
        metrics = await asyncio.get_event_loop().run_in_executor(None, engine.run)

        # ── 6. Persist trades ─────────────────────────────────────────────────
        trades = strategy.trades
        if trades:
            await conn.executemany(
                """
                INSERT INTO backtest_trades
                  (id, job_id, trade_id, symbol, direction,
                   entry_time, exit_time, entry_price, exit_price,
                   quantity, pnl, pnl_pct, exit_reason, mfe, mae)
                VALUES
                  (gen_random_uuid(), $1, $2, $3, $4,
                   $5, $6, $7, $8,
                   $9, $10, $11, $12, $13, $14)
                """,
                [
                    (
                        uuid.UUID(job_id),
                        t.trade_id, t.symbol, t.direction,
                        t.entry_time, t.exit_time,
                        t.entry_price, t.exit_price,
                        t.quantity, t.pnl, t.pnl_pct,
                        t.exit_reason, t.mfe, t.mae,
                    )
                    for t in trades
                ],
            )

        # Strip large arrays from metrics before storing in job row (trades stored separately)
        equity_curve    = metrics.pop("equityCurve", [])
        monthly_returns = metrics.pop("monthlyReturns", [])

        # ── 7. Mark completed ────────────────────────────────────────────────
        import orjson
        await conn.execute(
            """
            UPDATE backtest_jobs
            SET status='completed', completed_at=NOW(),
                metrics=$2::jsonb,
                equity_curve=$3::jsonb,
                monthly_returns=$4::jsonb
            WHERE id=$1
            """,
            uuid.UUID(job_id),
            orjson.dumps(metrics).decode(),
            orjson.dumps(equity_curve).decode(),
            orjson.dumps(monthly_returns).decode(),
        )
        log.info("Backtest %s completed — %d trades", job_id, len(trades))

    except Exception as exc:
        log.exception("Backtest %s failed", job_id)
        try:
            await conn.execute(
                "UPDATE backtest_jobs SET status='failed', error_message=$2 WHERE id=$1",
                uuid.UUID(job_id),
                str(exc),
            )
        except Exception:
            log.exception("Failed to mark backtest %s as failed", job_id)


def _parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()
