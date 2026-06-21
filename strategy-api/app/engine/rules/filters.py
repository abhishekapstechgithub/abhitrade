"""
Filters — gate conditions that must pass before any entry is attempted.
Unlike exit rules, filters operate at the bar level before entry logic runs.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import time
from ..data.candle import Candle


class RuleFilter(ABC):
    label: str = "filter"

    @abstractmethod
    def allow(self, candle: Candle, context: dict) -> bool:
        """
        Return True if trading is allowed on this bar.
        context can carry auxiliary series data (e.g. VIX value).
        """


class TimeWindow(RuleFilter):
    """Only allow entries between start_time and end_time (inclusive)."""
    label = "time_window"

    def __init__(self, start: str = "09:30", end: str = "14:30"):
        sh, sm = start.split(":")
        eh, em = end.split(":")
        self._start = time(int(sh), int(sm))
        self._end   = time(int(eh), int(em))

    def allow(self, candle: Candle, context: dict) -> bool:
        t = candle.timestamp.time()
        return self._start <= t <= self._end


class VixRange(RuleFilter):
    """
    Only trade when India VIX is within [min_vix, max_vix].
    VIX value expected in context["vix"].
    """
    label = "vix_range"

    def __init__(self, min_vix: float = 10.0, max_vix: float = 25.0):
        self.min_vix = min_vix
        self.max_vix = max_vix

    def allow(self, candle: Candle, context: dict) -> bool:
        vix = context.get("vix")
        if vix is None:
            return True   # no VIX data → don't block
        return self.min_vix <= vix <= self.max_vix


class VolumeMin(RuleFilter):
    """
    Only trade bars where volume is at least min_volume.
    Useful to avoid pre-market / illiquid periods.
    """
    label = "volume_min"

    def __init__(self, min_volume: int = 1000):
        self.min_volume = min_volume

    def allow(self, candle: Candle, context: dict) -> bool:
        return candle.volume >= self.min_volume
