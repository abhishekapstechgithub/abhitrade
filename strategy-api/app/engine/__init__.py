"""
Backtesting engine package.

Quick start:
    from app.engine.data.feed import GBMFeed
    from app.engine.engine import BacktestEngine
    from app.engine.strategy.presets import IronCondor

    feed     = GBMFeed()
    candles  = feed.get("NIFTY", "1D", date(2024, 1, 1), date(2024, 12, 31))
    strategy = IronCondor("NIFTY", 100_000, iv=0.14)
    engine   = BacktestEngine(candles, strategy)
    metrics  = engine.run()
"""
from .engine import BacktestEngine
from .runner import run_backtest
from .metrics import MetricsCalculator

__all__ = ["BacktestEngine", "run_backtest", "MetricsCalculator"]
