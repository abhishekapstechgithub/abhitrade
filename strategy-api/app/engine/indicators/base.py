"""
Indicator base class and the per-bar Series helper.

Design principles:
  - An Indicator receives the full candle history up to the current bar.
  - It returns a *vector* of values (one per bar), not a scalar.
  - NaN / None = not enough history yet (warm-up period).
  - Indicators are stateless: same input → same output every time.
    The engine caches the output for efficiency.

Adding a new indicator:
  1. Subclass Indicator.
  2. Implement compute(candles) → list[float | None].
  3. Register it in indicators/registry.py.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import TypeAlias

from ..data.candle import CandleSeries

# A series of float values aligned 1-to-1 with the candle array.
# None = insufficient history (warm-up).
Series: TypeAlias = list[float | None]


class Indicator(ABC):
    """Base class for all technical indicators."""

    # Human-readable name used in log messages and validation errors
    label: str = "Indicator"

    @abstractmethod
    def compute(self, candles: CandleSeries) -> Series:
        """
        Compute indicator values for all bars in `candles`.
        Returns a Series of the same length as candles.
        """

    def value_at(self, candles: CandleSeries, idx: int) -> float | None:
        """Convenience: compute and extract a single bar's value."""
        series = self.compute(candles)
        if idx < 0 or idx >= len(series):
            return None
        return series[idx]


# ─── Utility functions used by concrete indicators ────────────────────────────

def closes(candles: CandleSeries) -> list[float]:
    return [c.close for c in candles]

def highs(candles: CandleSeries) -> list[float]:
    return [c.high for c in candles]

def lows(candles: CandleSeries) -> list[float]:
    return [c.low for c in candles]

def opens(candles: CandleSeries) -> list[float]:
    return [c.open for c in candles]

def volumes(candles: CandleSeries) -> list[float]:
    return [float(c.volume) for c in candles]

def typical_prices(candles: CandleSeries) -> list[float]:
    return [(c.high + c.low + c.close) / 3.0 for c in candles]
