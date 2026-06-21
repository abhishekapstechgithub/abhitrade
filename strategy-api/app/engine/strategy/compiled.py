"""
CompiledStrategy — a strategy built from builder-JSON blocks at runtime.

The strategy is expressed as a directed graph:
  Indicator nodes → Condition nodes → Entry/Exit rule nodes

CompiledStrategy pre-computes all indicator series over the full candle set,
then calls evaluate_conditions() on each bar to decide entries/exits.
"""

from __future__ import annotations
from datetime import datetime
from ..data.candle import Candle, CandleSeries
from ..indicators.base import Series
from ..indicators.registry import build as build_indicator
from ..conditions.comparisons import Condition, AndGate, OrGate, BoolCondition, constant_series
from ..conditions.registry import build as build_condition
from ..rules.entry import EntryRule, BuyMarket, SellMarket
from ..rules.exit import ExitRule, StopLossPct, TargetPct, EODExit
from ..rules.filters import RuleFilter
from .base import Strategy, Trade


class CompiledStrategy(Strategy):
    """
    Runtime strategy compiled from the strategy builder JSON.

    Parameters supplied by BuilderParser.compile():
        indicators  — {node_id: (Indicator, computed Series)}
        entry_conds — list of (Condition, left_series, right_series)
        exit_conds  — same for exit
        entry_rule  — EntryRule instance (default BuyMarket)
        exit_rule   — ExitRule instance (default StopLossPct 2% + TargetPct 4% + EODExit)
        filters     — list[RuleFilter]
        direction   — 'LONG' | 'SHORT'
        quantity    — lots or shares
        lot_size    — 1 for equities
    """

    def __init__(
        self,
        symbol:          str,
        initial_capital: float,
        candles:         CandleSeries,
        indicators:      dict[str, tuple[object, Series]],
        entry_conds:     list[tuple[Condition, Series, Series]],
        exit_conds:      list[tuple[Condition, Series, Series]],
        entry_gates:     list[BoolCondition],
        exit_gates:      list[BoolCondition],
        entry_rule:      EntryRule,
        exit_rules:      list[ExitRule],
        filters:         list[RuleFilter],
        direction:       str = "LONG",
        quantity:        int = 1,
        lot_size:        int = 1,
    ):
        super().__init__(symbol, initial_capital)
        self.candles     = candles
        self.indicators  = indicators
        self.entry_conds = entry_conds
        self.exit_conds  = exit_conds
        self.entry_gates = entry_gates
        self.exit_gates  = exit_gates
        self.entry_rule  = entry_rule
        self.exit_rules  = exit_rules
        self.filters     = filters
        self.direction   = direction
        self.quantity    = quantity
        self.lot_size    = lot_size

        # Open position state
        self._in_position  = False
        self._entry_price  = 0.0
        self._entry_time:  datetime | None = None
        self._highest_seen = 0.0
        self._lowest_seen  = float("inf")
        self._mfe          = 0.0
        self._mae          = 0.0

    def on_bar(self, candle: Candle, bar_index: int) -> None:
        context: dict = {}

        if self._in_position:
            # Update MFE/MAE
            if self.direction == "LONG":
                move = candle.close - self._entry_price
            else:
                move = self._entry_price - candle.close
            self._mfe = max(self._mfe, move)
            self._mae = min(self._mae, move)

            self._highest_seen = max(self._highest_seen, candle.close)
            self._lowest_seen  = min(self._lowest_seen,  candle.close)

            # Check exit rules first (SL/TP/trailing/time)
            for rule in self.exit_rules:
                exit_px = rule.check(
                    candle, self._entry_price,
                    self.direction == "LONG",
                    self._highest_seen, self._lowest_seen,
                )
                if exit_px is not None:
                    self._close_position(candle, exit_px, rule.label)
                    return

            # Check signal-based exit conditions
            if self.exit_conds:
                signals = [c.evaluate(l, r, bar_index) for c, l, r in self.exit_conds]
                for gate in self.exit_gates:
                    if gate.evaluate(signals):
                        self._close_position(candle, candle.close, "signal")
                        return
                if not self.exit_gates and any(signals):
                    self._close_position(candle, candle.close, "signal")
            return

        # Not in position — check filters then entry conditions
        if not all(f.allow(candle, context) for f in self.filters):
            return

        if not self.entry_conds:
            return

        signals = [c.evaluate(l, r, bar_index) for c, l, r in self.entry_conds]

        should_enter = False
        if self.entry_gates:
            for gate in self.entry_gates:
                if gate.evaluate(signals):
                    should_enter = True
                    break
        else:
            should_enter = all(signals)   # default: AND of all conditions

        if should_enter:
            entry_px = self.entry_rule.entry_price(candle, candle.close)
            if entry_px is not None:
                self._open_position(candle, entry_px)

    def on_done(self) -> None:
        if self._in_position and self.candles:
            last = self.candles[-1]
            self._close_position(last, last.close, "eod")

    def _open_position(self, candle: Candle, price: float) -> None:
        self._in_position  = True
        self._entry_price  = price
        self._entry_time   = candle.timestamp
        self._highest_seen = price
        self._lowest_seen  = price
        self._mfe = 0.0
        self._mae = 0.0

    def _close_position(self, candle: Candle, price: float, reason: str) -> None:
        trade = self._make_trade(
            symbol      = self.symbol,
            direction   = self.direction,
            entry_time  = self._entry_time or candle.timestamp,
            exit_time   = candle.timestamp,
            entry_price = self._entry_price,
            exit_price  = price,
            quantity    = self.quantity * self.lot_size,
            exit_reason = reason,
            mfe         = self._mfe,
            mae         = self._mae,
        )
        self.trades.append(trade)
        self.cash += trade.pnl
        self._in_position = False
        self._entry_price = 0.0
        self._entry_time  = None
