"""
Exit rules — determine WHEN and at what price to exit a position.

Each ExitRule.check() is called on every bar while a position is open.
It returns the exit price if the rule fires, otherwise None.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import time
from ..data.candle import Candle


class ExitRule(ABC):
    label: str = "exit"

    @abstractmethod
    def check(
        self,
        candle:       Candle,
        entry_price:  float,
        is_long:      bool,
        highest_seen: float,
        lowest_seen:  float,
    ) -> float | None:
        """
        Return exit price if rule fires, else None.

        highest_seen / lowest_seen — max/min close since entry (for trailing stop).
        """


# ─── Stop-loss ────────────────────────────────────────────────────────────────

class StopLossPct(ExitRule):
    """Exit if price moves pct% against the trade."""
    label = "sl_pct"

    def __init__(self, pct: float = 2.0):
        self.pct = pct / 100

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if is_long:
            sl = entry_price * (1 - self.pct)
            if candle.low <= sl:
                return min(candle.open, sl)   # gap-down uses open
        else:
            sl = entry_price * (1 + self.pct)
            if candle.high >= sl:
                return max(candle.open, sl)
        return None


class StopLossPts(ExitRule):
    """Exit if price moves pts points against the trade."""
    label = "sl_pts"

    def __init__(self, points: float = 50.0):
        self.points = points

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if is_long:
            sl = entry_price - self.points
            if candle.low <= sl:
                return min(candle.open, sl)
        else:
            sl = entry_price + self.points
            if candle.high >= sl:
                return max(candle.open, sl)
        return None


# ─── Targets ──────────────────────────────────────────────────────────────────

class TargetPct(ExitRule):
    """Exit when profit reaches pct%."""
    label = "target_pct"

    def __init__(self, pct: float = 3.0):
        self.pct = pct / 100

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if is_long:
            tgt = entry_price * (1 + self.pct)
            if candle.high >= tgt:
                return max(candle.open, tgt)
        else:
            tgt = entry_price * (1 - self.pct)
            if candle.low <= tgt:
                return min(candle.open, tgt)
        return None


class TargetPts(ExitRule):
    """Exit when profit reaches pts points."""
    label = "target_pts"

    def __init__(self, points: float = 100.0):
        self.points = points

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if is_long:
            tgt = entry_price + self.points
            if candle.high >= tgt:
                return max(candle.open, tgt)
        else:
            tgt = entry_price - self.points
            if candle.low <= tgt:
                return min(candle.open, tgt)
        return None


# ─── Trailing stop ────────────────────────────────────────────────────────────

class TrailingStop(ExitRule):
    """
    Trailing stop-loss.
    For longs: trail_price = highest_seen * (1 - trail_pct/100)
    For shorts: trail_price = lowest_seen * (1 + trail_pct/100)
    """
    label = "trailing_stop"

    def __init__(self, trail_pct: float = 1.5):
        self.trail_pct = trail_pct / 100

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if is_long:
            trail = highest_seen * (1 - self.trail_pct)
            if candle.low <= trail:
                return min(candle.open, trail)
        else:
            trail = lowest_seen * (1 + self.trail_pct)
            if candle.high >= trail:
                return max(candle.open, trail)
        return None


# ─── Time-based exits ─────────────────────────────────────────────────────────

class TimeExit(ExitRule):
    """
    Exit at a specific time of day (e.g. 15:15 for intraday squareoff).
    Useful for MIS positions.
    """
    label = "time_exit"

    def __init__(self, exit_time: str = "15:15"):
        h, m = exit_time.split(":")
        self._exit_time = time(int(h), int(m))

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if candle.timestamp.time() >= self._exit_time:
            return candle.close
        return None


class EODExit(ExitRule):
    """Exit at end of the trading day (15:30 IST) — always fires on last bar."""
    label = "eod_exit"
    _EOD = time(15, 30)

    def check(self, candle, entry_price, is_long, highest_seen, lowest_seen):
        if candle.timestamp.time() >= self._EOD:
            return candle.close
        return None
