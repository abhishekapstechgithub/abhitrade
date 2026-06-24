"""
OptionLeg — tracks a single option leg from entry to exit.

A strategy (Iron Condor, Bull Call Spread, etc.) is composed of 1-4 legs.
Each leg records entry/exit details and computes P&L per lot.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from .greeks import OptionGreeks, black_scholes


class LegStatus(str, Enum):
    OPEN      = "open"
    CLOSED    = "closed"
    EXPIRED   = "expired"


@dataclass
class OptionLeg:
    """
    One CE or PE leg in an options strategy.

    Attributes:
        symbol      — underlying (e.g. 'NIFTY')
        option_type — 'CE' or 'PE'
        strike      — strike price
        expiry      — expiry date
        lot_size    — contracts per lot
        lots        — number of lots (negative = short)
        entry_price — premium paid/received per unit (not per lot)
        entry_date  — date the leg was entered
        entry_greeks — Greeks at entry
    """
    symbol:       str
    option_type:  str     # 'CE' | 'PE'
    strike:       float
    expiry:       date
    lot_size:     int
    lots:         int     # positive = long, negative = short

    entry_price:  float = 0.0
    entry_date:   date | None = None
    entry_greeks: OptionGreeks | None = None

    exit_price:   float = 0.0
    exit_date:    date | None = None
    exit_greeks:  OptionGreeks | None = None

    status: LegStatus = LegStatus.OPEN

    # ── entry / exit ──────────────────────────────────────────────────────────

    def open(
        self,
        premium: float,
        as_of: date,
        greeks: OptionGreeks | None = None,
    ) -> None:
        self.entry_price  = premium
        self.entry_date   = as_of
        self.entry_greeks = greeks
        self.status       = LegStatus.OPEN

    def close(
        self,
        premium: float,
        as_of: date,
        greeks: OptionGreeks | None = None,
    ) -> None:
        self.exit_price  = premium
        self.exit_date   = as_of
        self.exit_greeks = greeks
        self.status      = LegStatus.CLOSED

    def expire(self, spot: float, as_of: date) -> None:
        """Settle at expiry — intrinsic value only."""
        if self.option_type == "CE":
            intrinsic = max(spot - self.strike, 0.0)
        else:
            intrinsic = max(self.strike - spot, 0.0)
        self.close(intrinsic, as_of)
        self.status = LegStatus.EXPIRED

    # ── P&L calculations ─────────────────────────────────────────────────────

    @property
    def pnl_per_unit(self) -> float:
        """P&L for one unit (not adjusted for lots)."""
        if self.status == LegStatus.OPEN:
            return 0.0
        diff = self.exit_price - self.entry_price
        return diff * self.lots   # short lot → lots < 0 → profit when diff < 0

    @property
    def pnl(self) -> float:
        """Realised P&L in rupees (pnl_per_unit × lot_size × abs(lots))."""
        return self.pnl_per_unit * self.lot_size

    def unrealised_pnl(
        self,
        spot: float,
        as_of: date,
        iv: float,
        risk_free: float = 0.065,
    ) -> float:
        """Mark-to-market P&L using live/simulated option price."""
        if self.status != LegStatus.OPEN:
            return self.pnl
        T = max((self.expiry - as_of).days, 0) / 365.0
        g = black_scholes(spot, self.strike, T, iv, self.option_type, risk_free)
        diff = g.price - self.entry_price
        return diff * self.lots * self.lot_size

    # ── helpers ───────────────────────────────────────────────────────────────

    @property
    def direction(self) -> str:
        return "BUY" if self.lots > 0 else "SELL"

    @property
    def total_units(self) -> int:
        return abs(self.lots) * self.lot_size

    def __repr__(self) -> str:
        return (
            f"OptionLeg({self.direction} {abs(self.lots)}x "
            f"{self.symbol} {self.strike}{self.option_type} "
            f"exp={self.expiry} @ {self.entry_price:.2f} [{self.status.value}])"
        )
