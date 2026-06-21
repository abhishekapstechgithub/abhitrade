"""
BuilderParser — converts strategy builder JSON → CompiledStrategy.

Builder JSON shape (simplified):
{
  "blocks": [
    { "id": "b1", "type": "indicator", "subtype": "EMA",  "params": { "period": 9 } },
    { "id": "b2", "type": "indicator", "subtype": "EMA",  "params": { "period": 21 } },
    { "id": "c1", "type": "condition", "subtype": "crossover", "params": {},
      "connections": { "left": "b1", "right": "b2" }, "role": "entry" },
    { "id": "e1", "type": "entry",    "subtype": "buy_market", "params": {} },
    { "id": "x1", "type": "exit",     "subtype": "sl_pct",     "params": { "pct": 2 } },
    { "id": "x2", "type": "exit",     "subtype": "target_pct", "params": { "pct": 4 } },
    { "id": "f1", "type": "filter",   "subtype": "time_window",
      "params": { "start": "09:30", "end": "14:30" } },
    { "id": "g1", "type": "gate",     "subtype": "and",  "role": "entry",
      "connections": { "inputs": ["c1"] } }
  ],
  "meta": {
    "symbol":   "NIFTY",
    "direction": "LONG",
    "quantity":  1,
    "lot_size":  50
  }
}

Constant values in conditions use synthetic 'constant' blocks:
  { "id": "k1", "type": "constant", "value": 30 }
"""

from __future__ import annotations
from ..data.candle import CandleSeries
from ..indicators.registry import build as build_indicator
from ..conditions.comparisons import (
    Condition, BoolCondition, AndGate, OrGate, constant_series,
)
from ..conditions.registry import build as build_condition
from ..rules.entry import EntryRule, BuyMarket, SellMarket, BuyLimit, SellLimit
from ..rules.exit import (
    ExitRule, StopLossPct, StopLossPts, TargetPct, TargetPts,
    TrailingStop, TimeExit, EODExit,
)
from ..rules.filters import RuleFilter, TimeWindow, VixRange, VolumeMin
from .compiled import CompiledStrategy

_ENTRY_RULES: dict[str, type[EntryRule]] = {
    "buy_market":  BuyMarket,
    "sell_market": SellMarket,
    "buy_limit":   BuyLimit,
    "sell_limit":  SellLimit,
}
_EXIT_RULES: dict[str, type[ExitRule]] = {
    "sl_pct":        StopLossPct,
    "sl_pts":        StopLossPts,
    "target_pct":    TargetPct,
    "target_pts":    TargetPts,
    "trailing_stop": TrailingStop,
    "time_exit":     TimeExit,
    "eod_exit":      EODExit,
}
_FILTERS: dict[str, type[RuleFilter]] = {
    "time_window": TimeWindow,
    "vix_range":   VixRange,
    "volume_min":  VolumeMin,
}


class BuilderParser:
    """Parses builder JSON and compiles a CompiledStrategy."""

    def compile(
        self,
        builder_json: dict,
        candles:      CandleSeries,
        initial_capital: float = 100_000,
    ) -> CompiledStrategy:
        blocks    = {b["id"]: b for b in builder_json.get("blocks", [])}
        meta      = builder_json.get("meta", {})
        symbol    = meta.get("symbol", "NIFTY")
        direction = meta.get("direction", "LONG").upper()
        quantity  = int(meta.get("quantity", 1))
        lot_size  = int(meta.get("lot_size", 1))

        # ── 1. Compute all indicator series ───────────────────────────────────
        computed: dict[str, list] = {}   # block_id → series

        for bid, block in blocks.items():
            if block["type"] == "indicator":
                ind = build_indicator(block["subtype"], block.get("params", {}))
                computed[bid] = ind.compute(candles)
            elif block["type"] == "constant":
                computed[bid] = constant_series(float(block["value"]), len(candles))

        # ── 2. Build condition objects ─────────────────────────────────────────
        entry_conds: list[tuple[Condition, list, list]] = []
        exit_conds:  list[tuple[Condition, list, list]] = []

        for bid, block in blocks.items():
            if block["type"] != "condition":
                continue
            cond = build_condition(block["subtype"], block.get("params", {}))
            conns = block.get("connections", {})
            left  = computed.get(conns.get("left",  ""), [None] * len(candles))
            right = computed.get(conns.get("right", ""), [None] * len(candles))
            role  = block.get("role", "entry")
            if role == "exit":
                exit_conds.append((cond, left, right))
            else:
                entry_conds.append((cond, left, right))

        # ── 3. Gates (AND/OR of conditions) ───────────────────────────────────
        entry_gates: list[BoolCondition] = []
        exit_gates:  list[BoolCondition] = []

        for bid, block in blocks.items():
            if block["type"] != "gate":
                continue
            subtype = block["subtype"].lower()
            gate: BoolCondition = AndGate() if subtype == "and" else OrGate()
            role = block.get("role", "entry")
            if role == "exit":
                exit_gates.append(gate)
            else:
                entry_gates.append(gate)

        # ── 4. Entry rule ──────────────────────────────────────────────────────
        entry_rule: EntryRule = BuyMarket()   # default
        for bid, block in blocks.items():
            if block["type"] == "entry":
                cls = _ENTRY_RULES.get(block["subtype"], BuyMarket)
                entry_rule = _instantiate(cls, block.get("params", {}))
                break

        # ── 5. Exit rules (can be multiple) ───────────────────────────────────
        exit_rules: list[ExitRule] = []
        for bid, block in blocks.items():
            if block["type"] == "exit":
                cls = _EXIT_RULES.get(block["subtype"])
                if cls:
                    exit_rules.append(_instantiate(cls, block.get("params", {})))
        if not exit_rules:
            exit_rules = [StopLossPct(2.0), TargetPct(4.0), EODExit()]

        # ── 6. Filters ────────────────────────────────────────────────────────
        filters: list[RuleFilter] = []
        for bid, block in blocks.items():
            if block["type"] == "filter":
                cls = _FILTERS.get(block["subtype"])
                if cls:
                    filters.append(_instantiate(cls, block.get("params", {})))

        return CompiledStrategy(
            symbol          = symbol,
            initial_capital = initial_capital,
            candles         = candles,
            indicators      = {},   # series already embedded in conditions
            entry_conds     = entry_conds,
            exit_conds      = exit_conds,
            entry_gates     = entry_gates,
            exit_gates      = exit_gates,
            entry_rule      = entry_rule,
            exit_rules      = exit_rules,
            filters         = filters,
            direction       = direction,
            quantity        = quantity,
            lot_size        = lot_size,
        )


def _instantiate(cls, params: dict):
    import inspect
    sig    = inspect.signature(cls.__init__)
    valid  = {k for k in sig.parameters if k != "self"}
    kwargs = {k: v for k, v in params.items() if k in valid}
    return cls(**kwargs)
