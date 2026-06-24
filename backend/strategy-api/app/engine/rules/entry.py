"""
Entry rules — determine HOW to enter a position when an entry condition fires.

Each rule takes a Candle and returns an entry price (or None to skip).
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from ..data.candle import Candle


class EntryRule(ABC):
    label: str = "entry"

    @abstractmethod
    def entry_price(self, candle: Candle, trigger_price: float | None = None) -> float | None:
        """
        Return the price at which to enter, or None if the bar doesn't allow entry.
        trigger_price is the price that activated the condition (e.g. close of signal bar).
        """


class BuyMarket(EntryRule):
    """Enter long at the open of the next bar (market order simulation)."""
    label = "buy_market"

    def entry_price(self, candle: Candle, trigger_price: float | None = None) -> float | None:
        return candle.open


class SellMarket(EntryRule):
    """Enter short at the open of the next bar."""
    label = "sell_market"

    def entry_price(self, candle: Candle, trigger_price: float | None = None) -> float | None:
        return candle.open


class BuyLimit(EntryRule):
    """
    Enter long only if the bar's low touches the limit price.
    limit_price = trigger_price * (1 - offset_pct/100)
    """
    label = "buy_limit"

    def __init__(self, offset_pct: float = 0.5):
        self.offset_pct = offset_pct

    def entry_price(self, candle: Candle, trigger_price: float | None = None) -> float | None:
        if trigger_price is None:
            return None
        limit = trigger_price * (1 - self.offset_pct / 100)
        if candle.low <= limit <= candle.high:
            return limit
        return None


class SellLimit(EntryRule):
    """Enter short only if the bar's high touches the limit price."""
    label = "sell_limit"

    def __init__(self, offset_pct: float = 0.5):
        self.offset_pct = offset_pct

    def entry_price(self, candle: Candle, trigger_price: float | None = None) -> float | None:
        if trigger_price is None:
            return None
        limit = trigger_price * (1 + self.offset_pct / 100)
        if candle.low <= limit <= candle.high:
            return limit
        return None
