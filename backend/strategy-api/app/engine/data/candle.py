"""
Candle — the atomic unit of market data the engine operates on.

Every data feed produces Candle objects. Every indicator consumes them.
Keeping this as a plain dataclass (not a Pydantic model) keeps it fast
for tight loops over thousands of bars.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass(slots=True)
class Candle:
    # Identity
    timestamp: datetime
    date:      date
    symbol:    str
    timeframe: str          # "1m" | "5m" | "15m" | "1D" …

    # OHLCV
    open:   float
    high:   float
    low:    float
    close:  float
    volume: int = 0

    # Derivatives market fields (0 when not applicable)
    oi:     int   = 0       # Open interest
    iv:     float = 0.0     # Implied volatility (%)

    # Index within the bar array — set by the feed
    index: int = 0

    @property
    def typical(self) -> float:
        """(H + L + C) / 3 — used by VWAP."""
        return (self.high + self.low + self.close) / 3.0

    @property
    def is_green(self) -> bool:
        return self.close >= self.open

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low

    def __repr__(self) -> str:
        return (
            f"Candle({self.symbol} {self.date} {self.timeframe} "
            f"O={self.open} H={self.high} L={self.low} C={self.close})"
        )


# ─── Typed alias for the series the engine carries ───────────────────────────

CandleSeries = list[Candle]
