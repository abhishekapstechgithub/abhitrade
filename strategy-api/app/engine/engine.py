"""
BacktestEngine — the bar-by-bar simulation loop.

Usage:
    feed    = GBMFeed()
    candles = feed.get("NIFTY", "1D", start, end)
    strategy = IronCondor("NIFTY", 100_000, iv=0.14)
    engine  = BacktestEngine(candles, strategy)
    result  = engine.run()
"""

from __future__ import annotations
import logging
from datetime import date
from .data.candle import CandleSeries
from .strategy.base import Strategy, StrategyResult
from .metrics import MetricsCalculator

log = logging.getLogger(__name__)


class BacktestEngine:
    """
    Drives the strategy through candles one-by-one.

    The engine is stateless — create a new one per run.
    """

    def __init__(
        self,
        candles:         CandleSeries,
        strategy:        Strategy,
        slippage_pct:    float = 0.05,
        brokerage_per_trade: float = 40.0,
    ):
        self.candles          = candles
        self.strategy         = strategy
        self.slippage_pct     = slippage_pct
        self.brokerage_per_trade = brokerage_per_trade

    def run(self) -> dict:
        """
        Execute the full bar loop and return computed metrics dict.
        """
        if not self.candles:
            log.warning("BacktestEngine: no candles supplied, returning empty result")
            return MetricsCalculator([], self.strategy.initial_capital).compute()

        log.info(
            "BacktestEngine: running %s bars from %s to %s",
            len(self.candles),
            self.candles[0].date,
            self.candles[-1].date,
        )

        for idx, candle in enumerate(self.candles):
            try:
                self.strategy.on_bar(candle, idx)
            except Exception:
                log.exception("Strategy raised on bar %d (%s)", idx, candle.timestamp)

        self.strategy.on_done()

        # Apply brokerage costs
        for trade in self.strategy.trades:
            trade.pnl = round(trade.pnl - self.brokerage_per_trade, 2)

        calc = MetricsCalculator(
            self.strategy.trades,
            self.strategy.initial_capital,
        )
        return calc.compute()
