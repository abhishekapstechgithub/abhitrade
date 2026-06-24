"""
Strategy ABC — all runnable strategies must implement on_bar().

The engine calls on_bar() for every candle in the backtest range.
The strategy decides when to open/close positions and appends Trade objects.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..data.candle import Candle


@dataclass
class Trade:
    """A completed round-trip trade."""
    trade_id:     str
    symbol:       str
    direction:    str              # 'LONG' | 'SHORT'
    entry_time:   datetime
    exit_time:    datetime
    entry_price:  float
    exit_price:   float
    quantity:     int              # total units (lots × lot_size for options)
    pnl:          float
    pnl_pct:      float
    exit_reason:  str              # 'sl' | 'target' | 'trailing' | 'eod' | 'signal' | 'expiry'
    # MFE / MAE — max favourable / adverse excursion during the trade
    mfe:          float = 0.0
    mae:          float = 0.0
    tags:         list[str] = field(default_factory=list)


@dataclass
class StrategyResult:
    """Returned by strategy.run()."""
    trades:    list[Trade]
    metadata:  dict = field(default_factory=dict)


class Strategy(ABC):
    """
    Base class for all backtesting strategies.

    Subclasses override on_bar() to implement their logic.
    The engine supplies candles one-at-a-time in chronological order.
    """

    def __init__(self, symbol: str, initial_capital: float = 100_000):
        self.symbol          = symbol
        self.initial_capital = initial_capital
        self.cash            = initial_capital
        self.trades:  list[Trade] = []
        self._trade_counter = 0

    @abstractmethod
    def on_bar(self, candle: "Candle", bar_index: int) -> None:
        """Process one candle. Append to self.trades when a position is closed."""

    def on_done(self) -> None:
        """Called once after the last bar. Override to force-close open positions."""

    def result(self) -> StrategyResult:
        return StrategyResult(trades=self.trades)

    def _next_trade_id(self) -> str:
        self._trade_counter += 1
        return f"TRD-{self._trade_counter:05d}"

    def _make_trade(
        self,
        symbol:       str,
        direction:    str,
        entry_time:   datetime,
        exit_time:    datetime,
        entry_price:  float,
        exit_price:   float,
        quantity:     int,
        exit_reason:  str,
        mfe:          float = 0.0,
        mae:          float = 0.0,
        tags:         list[str] | None = None,
    ) -> Trade:
        pnl = (exit_price - entry_price) * quantity
        if direction == "SHORT":
            pnl = -pnl
        pnl_pct = (pnl / (entry_price * quantity) * 100) if entry_price else 0.0
        return Trade(
            trade_id    = self._next_trade_id(),
            symbol      = symbol,
            direction   = direction,
            entry_time  = entry_time,
            exit_time   = exit_time,
            entry_price = entry_price,
            exit_price  = exit_price,
            quantity    = quantity,
            pnl         = round(pnl, 2),
            pnl_pct     = round(pnl_pct, 4),
            exit_reason = exit_reason,
            mfe         = round(mfe, 2),
            mae         = round(mae, 2),
            tags        = tags or [],
        )
