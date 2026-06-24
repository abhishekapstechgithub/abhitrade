"""
Condition implementations: Crossover, Crossunder, Above, Below, Between,
plus logical gates (AndGate, OrGate).

Each Condition receives two Series (left / right) and a bar index,
and returns True / False.

Adding a new condition:
  1. Subclass Condition.
  2. Implement evaluate(left, right, idx) → bool.
  3. Register in registry.py.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from ..indicators.base import Series


class Condition(ABC):
    """
    Base for all conditions.

    left  = output series of the left-side indicator / value
    right = output series of the right-side indicator / constant
    """
    label: str = "Condition"

    @abstractmethod
    def evaluate(
        self,
        left:  Series,
        right: Series,
        idx:   int,
    ) -> bool:
        """Return True if the condition is met at bar index `idx`."""

    @staticmethod
    def _val(series: Series, idx: int) -> float | None:
        if idx < 0 or idx >= len(series):
            return None
        return series[idx]


class Crossover(Condition):
    """Left crosses above right (previous bar: left < right, current: left > right)."""
    label = "crossover"

    def evaluate(self, left: Series, right: Series, idx: int) -> bool:
        if idx < 1:
            return False
        l_cur  = self._val(left,  idx)
        r_cur  = self._val(right, idx)
        l_prev = self._val(left,  idx - 1)
        r_prev = self._val(right, idx - 1)
        if None in (l_cur, r_cur, l_prev, r_prev):
            return False
        return l_prev <= r_prev and l_cur > r_cur   # type: ignore[operator]


class Crossunder(Condition):
    """Left crosses below right."""
    label = "crossunder"

    def evaluate(self, left: Series, right: Series, idx: int) -> bool:
        if idx < 1:
            return False
        l_cur  = self._val(left,  idx)
        r_cur  = self._val(right, idx)
        l_prev = self._val(left,  idx - 1)
        r_prev = self._val(right, idx - 1)
        if None in (l_cur, r_cur, l_prev, r_prev):
            return False
        return l_prev >= r_prev and l_cur < r_cur   # type: ignore[operator]


class Above(Condition):
    """Left is strictly above right."""
    label = "above"

    def evaluate(self, left: Series, right: Series, idx: int) -> bool:
        l = self._val(left, idx)
        r = self._val(right, idx)
        if l is None or r is None:
            return False
        return l > r


class Below(Condition):
    """Left is strictly below right."""
    label = "below"

    def evaluate(self, left: Series, right: Series, idx: int) -> bool:
        l = self._val(left, idx)
        r = self._val(right, idx)
        if l is None or r is None:
            return False
        return l < r


class Between(Condition):
    """Left is between right_low and right_high (inclusive).
    Convention: right[0] = lower bound, right[1] = upper bound.
    If right is a single series, uses ±threshold around it.
    """
    label = "between"

    def __init__(self, threshold: float = 0.0):
        self.threshold = threshold

    def evaluate(self, left: Series, right: Series, idx: int) -> bool:
        l = self._val(left, idx)
        r = self._val(right, idx)
        if l is None or r is None:
            return False
        lo = r - self.threshold
        hi = r + self.threshold
        return lo <= l <= hi


# ─── Logical gates ────────────────────────────────────────────────────────────

class BoolCondition(ABC):
    """Gate that combines multiple bool signals."""

    @abstractmethod
    def evaluate(self, signals: list[bool]) -> bool: ...


class AndGate(BoolCondition):
    """True only when all input signals are True."""
    label = "and_gate"

    def evaluate(self, signals: list[bool]) -> bool:
        return all(signals)


class OrGate(BoolCondition):
    """True when at least one input signal is True."""
    label = "or_gate"

    def evaluate(self, signals: list[bool]) -> bool:
        return any(signals)


# ─── Constant series helper ───────────────────────────────────────────────────

def constant_series(value: float, length: int) -> Series:
    """Create a flat series of a constant value (for threshold comparisons)."""
    return [value] * length
