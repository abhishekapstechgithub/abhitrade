"""
Indicator registry — maps builder block subtypes to Indicator instances.

The builder JSON block has:
  { "type": "indicator", "subtype": "EMA", "params": { "period": 20 } }

registry.build(subtype, params) → Indicator

Adding a new indicator:
  1. Implement the class in trend/momentum/volatility.py.
  2. Add the subtype → factory mapping below.
"""

from __future__ import annotations
from .base import Indicator
from .trend import EMA, SMA, VWAP, ATR, Supertrend
from .momentum import RSI, MACD
from .volatility import BollingerBands


# Each factory takes the block's params dict and returns an Indicator instance.
_REGISTRY: dict[str, type[Indicator]] = {
    # Trend
    "EMA":        EMA,
    "SMA":        SMA,
    "VWAP":       VWAP,
    "ATR":        ATR,
    "SUPERTREND": Supertrend,
    # Momentum
    "RSI":        RSI,
    "MACD":       MACD,
    # Volatility
    "BOLLINGER":  BollingerBands,
}


def build(subtype: str, params: dict) -> Indicator:
    """
    Instantiate an Indicator from a builder-JSON block.

    Parameters are mapped by constructor argument names.
    Unknown params are silently ignored (safe for forward compatibility).
    """
    cls = _REGISTRY.get(subtype.upper())
    if cls is None:
        raise ValueError(f"Unknown indicator subtype: '{subtype}'. "
                         f"Known: {sorted(_REGISTRY.keys())}")

    # Filter params to only those the constructor accepts
    import inspect
    sig    = inspect.signature(cls.__init__)
    valid  = {k for k in sig.parameters if k != "self"}
    kwargs = {k: _coerce(k, v) for k, v in params.items() if k in valid}
    return cls(**kwargs)


def _coerce(key: str, value) -> int | float | str | bool:
    """Convert string param values from the JSON to the right Python type."""
    if isinstance(value, (int, float, bool)):
        return value
    # Heuristic: period/length fields should be int, multiplier/std_dev float
    if key in ("period", "fast", "slow", "signal", "length"):
        return int(value)
    if key in ("multiplier", "std_dev", "factor"):
        return float(value)
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return float(value)
        except (ValueError, TypeError):
            return str(value)


def list_subtypes() -> list[str]:
    return sorted(_REGISTRY.keys())
