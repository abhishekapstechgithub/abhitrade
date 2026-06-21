"""
Momentum indicators: RSI, MACD.
"""

from __future__ import annotations
from ..data.candle import CandleSeries
from .base import Indicator, Series, closes


class RSI(Indicator):
    """Relative Strength Index (Wilder's smoothing)."""
    label = "RSI"

    def __init__(self, period: int = 14):
        self.period = period

    def compute(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        n      = len(prices)
        result: Series = [None] * n

        if n < self.period + 1:
            return result

        gains: list[float] = []
        losses: list[float] = []
        for i in range(1, n):
            diff = prices[i] - prices[i - 1]
            gains.append(max(diff, 0.0))
            losses.append(abs(min(diff, 0.0)))

        # Seed with simple average over first period
        avg_gain = sum(gains[: self.period]) / self.period
        avg_loss = sum(losses[: self.period]) / self.period

        for i in range(self.period, n):
            j = i - 1   # index into gains/losses (offset by 1)
            avg_gain = (avg_gain * (self.period - 1) + gains[j]) / self.period
            avg_loss = (avg_loss * (self.period - 1) + losses[j]) / self.period

            if avg_loss == 0:
                result[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                result[i] = round(100.0 - 100.0 / (1.0 + rs), 4)

        return result


class MACD(Indicator):
    """
    MACD — returns the MACD line (fast_ema - slow_ema).
    Call MACDSignal / MACDHistogram for the other two lines.
    """
    label = "MACD"

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        self.fast   = fast
        self.slow   = slow
        self.signal = signal
        self._fast_ema = _EMAValues(fast)
        self._slow_ema = _EMAValues(slow)

    def compute(self, candles: CandleSeries) -> Series:
        n      = len(candles)
        result: Series = [None] * n

        fast_s = self._fast_ema.compute(candles)
        slow_s = self._slow_ema.compute(candles)

        for i in range(n):
            if fast_s[i] is not None and slow_s[i] is not None:
                result[i] = round(fast_s[i] - slow_s[i], 4)   # type: ignore[operator]

        return result

    def signal_line(self, candles: CandleSeries) -> Series:
        """9-EMA of the MACD line."""
        macd_series = self.compute(candles)
        n = len(macd_series)
        result: Series = [None] * n

        # Build a pseudo-candle list from MACD values
        valid_indices = [i for i, v in enumerate(macd_series) if v is not None]
        if len(valid_indices) < self.signal:
            return result

        # Wilder EMA on MACD values
        k = 2.0 / (self.signal + 1)
        start_idx = valid_indices[self.signal - 1]
        seed_values = [macd_series[i] for i in valid_indices[: self.signal]]
        ema = sum(seed_values) / self.signal    # type: ignore[arg-type]
        result[start_idx] = round(ema, 4)

        for i in valid_indices[self.signal:]:
            ema = macd_series[i] * k + ema * (1 - k)   # type: ignore[operator]
            result[i] = round(ema, 4)

        return result

    def histogram(self, candles: CandleSeries) -> Series:
        """MACD line - signal line."""
        macd_s   = self.compute(candles)
        signal_s = self.signal_line(candles)
        n = len(macd_s)
        result: Series = [None] * n
        for i in range(n):
            if macd_s[i] is not None and signal_s[i] is not None:
                result[i] = round(macd_s[i] - signal_s[i], 4)  # type: ignore[operator]
        return result


class _EMAValues(Indicator):
    """Internal EMA used by MACD — same as trend.EMA but avoids circular import."""
    label = "EMA"

    def __init__(self, period: int):
        self.period = period

    def compute(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        n      = len(prices)
        result: Series = [None] * n
        if n < self.period:
            return result
        k   = 2.0 / (self.period + 1)
        ema = sum(prices[: self.period]) / self.period
        result[self.period - 1] = ema
        for i in range(self.period, n):
            ema = prices[i] * k + ema * (1 - k)
            result[i] = round(ema, 4)
        return result
