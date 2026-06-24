"""
Volatility indicators: Bollinger Bands (middle/upper/lower), ATR.
ATR is also exported from trend.py; this file re-exports for convenience.
"""

from __future__ import annotations
from ..data.candle import CandleSeries
from .base import Indicator, Series, closes
from .trend import ATR  # re-export for callers that import from here


class BollingerBands(Indicator):
    """
    Bollinger Bands.
    Returns the MIDDLE band (SMA).
    Use .upper() and .lower() for the envelope bands.
    """
    label = "BOLLINGER"

    def __init__(self, period: int = 20, std_dev: float = 2.0):
        self.period  = period
        self.std_dev = std_dev

    def _rolling_stats(self, prices: list[float]) -> list[tuple[float, float] | None]:
        """Return (mean, std) for each rolling window. None if warm-up."""
        n = len(prices)
        result: list[tuple[float, float] | None] = [None] * n
        for i in range(self.period - 1, n):
            window = prices[i - self.period + 1 : i + 1]
            mean   = sum(window) / self.period
            var    = sum((x - mean) ** 2 for x in window) / self.period
            std    = var ** 0.5
            result[i] = (mean, std)
        return result

    def compute(self, candles: CandleSeries) -> Series:
        """Middle band = SMA."""
        prices = closes(candles)
        stats  = self._rolling_stats(prices)
        return [round(s[0], 4) if s else None for s in stats]

    def upper(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        stats  = self._rolling_stats(prices)
        return [round(s[0] + self.std_dev * s[1], 4) if s else None for s in stats]

    def lower(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        stats  = self._rolling_stats(prices)
        return [round(s[0] - self.std_dev * s[1], 4) if s else None for s in stats]

    def bandwidth(self, candles: CandleSeries) -> Series:
        """(upper - lower) / middle — normalised width."""
        mid = self.compute(candles)
        up  = self.upper(candles)
        lo  = self.lower(candles)
        return [
            round((u - l) / m, 6) if m and u and l and m != 0 else None
            for m, u, l in zip(mid, up, lo)
        ]

    def percent_b(self, candles: CandleSeries) -> Series:
        """(close - lower) / (upper - lower) — position within bands."""
        prices = closes(candles)
        up  = self.upper(candles)
        lo  = self.lower(candles)
        result: Series = []
        for price, u, l in zip(prices, up, lo):
            if u is not None and l is not None and (u - l) != 0:
                result.append(round((price - l) / (u - l), 6))
            else:
                result.append(None)
        return result


__all__ = ["BollingerBands", "ATR"]
