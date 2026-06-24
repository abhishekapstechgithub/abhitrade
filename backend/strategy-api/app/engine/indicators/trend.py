"""
Trend indicators: EMA, SMA, VWAP, Supertrend.
"""

from __future__ import annotations
import math
from ..data.candle import CandleSeries
from .base import Indicator, Series, closes, highs, lows, typical_prices, volumes


class EMA(Indicator):
    """Exponential Moving Average."""
    label = "EMA"

    def __init__(self, period: int = 20):
        self.period = period

    def compute(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        n      = len(prices)
        result: Series = [None] * n
        if n < self.period:
            return result

        k    = 2.0 / (self.period + 1)
        # Seed with the SMA of the first `period` bars
        sma  = sum(prices[: self.period]) / self.period
        result[self.period - 1] = sma
        ema  = sma

        for i in range(self.period, n):
            ema = prices[i] * k + ema * (1 - k)
            result[i] = round(ema, 4)

        return result


class SMA(Indicator):
    """Simple Moving Average."""
    label = "SMA"

    def __init__(self, period: int = 20):
        self.period = period

    def compute(self, candles: CandleSeries) -> Series:
        prices = closes(candles)
        n      = len(prices)
        result: Series = [None] * n

        for i in range(self.period - 1, n):
            result[i] = round(sum(prices[i - self.period + 1 : i + 1]) / self.period, 4)

        return result


class VWAP(Indicator):
    """
    Volume Weighted Average Price.
    Resets at the start of each trading day.
    """
    label = "VWAP"

    def compute(self, candles: CandleSeries) -> Series:
        result: Series = []
        cum_tp_vol = 0.0
        cum_vol    = 0.0
        current_date = None

        for c in candles:
            if c.date != current_date:
                cum_tp_vol = 0.0
                cum_vol    = 0.0
                current_date = c.date
            cum_tp_vol += c.typical * c.volume
            cum_vol    += c.volume
            result.append(round(cum_tp_vol / cum_vol, 4) if cum_vol > 0 else c.close)

        return result


class ATR(Indicator):
    """Average True Range."""
    label = "ATR"

    def __init__(self, period: int = 14):
        self.period = period

    def compute(self, candles: CandleSeries) -> Series:
        n      = len(candles)
        result: Series = [None] * n

        tr_series: list[float] = []
        for i, c in enumerate(candles):
            if i == 0:
                tr_series.append(c.high - c.low)
            else:
                prev_close = candles[i - 1].close
                tr = max(
                    c.high - c.low,
                    abs(c.high - prev_close),
                    abs(c.low  - prev_close),
                )
                tr_series.append(tr)

        if n < self.period:
            return result

        # Seed ATR with simple average
        atr = sum(tr_series[: self.period]) / self.period
        result[self.period - 1] = round(atr, 4)

        for i in range(self.period, n):
            atr = (atr * (self.period - 1) + tr_series[i]) / self.period
            result[i] = round(atr, 4)

        return result


class Supertrend(Indicator):
    """
    Supertrend indicator.
    Returns the supertrend line value (positive = uptrend, negative = downtrend).
    Direction: +1 = bullish, -1 = bearish (encoded as sign of the series value).
    """
    label = "SUPERTREND"

    def __init__(self, period: int = 10, multiplier: float = 3.0):
        self.period     = period
        self.multiplier = multiplier

    def compute(self, candles: CandleSeries) -> Series:
        n      = len(candles)
        result: Series = [None] * n

        atr_series = ATR(self.period).compute(candles)

        upper_band:  list[float | None] = [None] * n
        lower_band:  list[float | None] = [None] * n
        supertrend:  list[float | None] = [None] * n
        direction:   list[int]          = [1]  * n   # 1 = up, -1 = down

        for i in range(self.period, n):
            atr = atr_series[i]
            if atr is None:
                continue

            hl2    = (candles[i].high + candles[i].low) / 2.0
            ub = hl2 + self.multiplier * atr
            lb = hl2 - self.multiplier * atr

            # Adjust bands based on previous values
            prev_ub = upper_band[i - 1] or ub
            prev_lb = lower_band[i - 1] or lb
            close   = candles[i].close

            upper_band[i] = ub if ub < prev_ub or candles[i - 1].close > prev_ub else prev_ub
            lower_band[i] = lb if lb > prev_lb or candles[i - 1].close < prev_lb else prev_lb

            prev_st = supertrend[i - 1]
            prev_d  = direction[i - 1]

            if prev_st is None:
                direction[i]  = 1
                supertrend[i] = lower_band[i]
            elif prev_d == -1 and close > (upper_band[i] or 0):
                direction[i]  = 1
                supertrend[i] = lower_band[i]
            elif prev_d == 1 and close < (lower_band[i] or 0):
                direction[i]  = -1
                supertrend[i] = upper_band[i]
            else:
                direction[i]  = prev_d
                supertrend[i] = (lower_band[i] if prev_d == 1 else upper_band[i])

            # Encode direction into sign: positive value = bullish, negative = bearish
            st = supertrend[i]
            if st is not None:
                result[i] = round(st * direction[i], 4)

        return result
