"""
Condition registry — maps builder block subtypes to Condition classes.

The builder JSON connection block specifies the condition type:
  { "type": "condition", "subtype": "crossover", "params": {} }

build(subtype, params) → Condition instance
"""

from __future__ import annotations
from .comparisons import Condition, Crossover, Crossunder, Above, Below, Between

_REGISTRY: dict[str, type[Condition]] = {
    "crossover":  Crossover,
    "crossunder": Crossunder,
    "above":      Above,
    "below":      Below,
    "between":    Between,
}


def build(subtype: str, params: dict | None = None) -> Condition:
    params = params or {}
    cls = _REGISTRY.get(subtype.lower())
    if cls is None:
        raise ValueError(
            f"Unknown condition subtype: '{subtype}'. "
            f"Known: {sorted(_REGISTRY.keys())}"
        )
    import inspect
    sig    = inspect.signature(cls.__init__)
    valid  = {k for k in sig.parameters if k != "self"}
    kwargs = {k: v for k, v in params.items() if k in valid}
    return cls(**kwargs)


def list_subtypes() -> list[str]:
    return sorted(_REGISTRY.keys())
