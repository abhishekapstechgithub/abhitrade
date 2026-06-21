"""
OptionChain — builds a synthetic option chain around a spot price.

For backtesting, the chain is built on-the-fly from spot + IV assumptions.
In live mode this would be replaced with exchange data.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from datetime import date
from .greeks import black_scholes, OptionGreeks

# Lot sizes for common NSE instruments (backtesting defaults)
_LOT_SIZES: dict[str, int] = {
    "NIFTY":     50,
    "BANKNIFTY": 15,
    "FINNIFTY":  40,
    "MIDCPNIFTY": 75,
    "SENSEX":    10,
    "BANKEX":    15,
}
_DEFAULT_LOT = 50

# Strike intervals (points between strikes)
_STRIKE_INTERVALS: dict[str, int] = {
    "NIFTY":     50,
    "BANKNIFTY": 100,
    "FINNIFTY":  50,
    "MIDCPNIFTY": 25,
    "SENSEX":    100,
    "BANKEX":    100,
}
_DEFAULT_INTERVAL = 50

# Base IV assumptions per symbol (annualised)
_BASE_IV: dict[str, float] = {
    "NIFTY":     0.14,
    "BANKNIFTY": 0.18,
    "FINNIFTY":  0.16,
    "SENSEX":    0.14,
}
_DEFAULT_IV = 0.15


@dataclass
class Strike:
    """One strike in the chain — holds both CE and PE Greeks."""
    strike:  float
    ce:      OptionGreeks
    pe:      OptionGreeks
    is_atm:  bool = False
    is_itm_ce: bool = False
    is_itm_pe: bool = False


class OptionChain:
    """
    Builds a synthetic option chain for a given spot, expiry, and IV.

    Usage:
        chain = OptionChain("NIFTY", spot=22000, expiry=date(2024, 3, 28),
                            as_of=date(2024, 3, 21), iv=0.14)
        atm_strike = chain.atm_strike()
        ce_greeks  = chain.get_strike(22000).ce
        otm_ce     = chain.otm_strikes("CE", n=2)
    """

    def __init__(
        self,
        symbol:   str,
        spot:     float,
        expiry:   date,
        as_of:    date,
        iv:       float | None = None,
        risk_free: float = 0.065,
    ):
        self.symbol    = symbol.upper()
        self.spot      = spot
        self.expiry    = expiry
        self.as_of     = as_of
        self.iv        = iv or _BASE_IV.get(self.symbol, _DEFAULT_IV)
        self.risk_free = risk_free

        days_left      = (expiry - as_of).days
        self.T         = max(days_left, 0) / 365.0

        self.interval  = _STRIKE_INTERVALS.get(self.symbol, _DEFAULT_INTERVAL)
        self.lot_size  = _LOT_SIZES.get(self.symbol, _DEFAULT_LOT)

        self._strikes: dict[float, Strike] | None = None

    def _build(self, n_wings: int = 10) -> dict[float, Strike]:
        """Build strike dict covering ATM ± n_wings strikes."""
        atm = self._round_to_interval(self.spot)
        strikes = {}
        for i in range(-n_wings, n_wings + 1):
            k = atm + i * self.interval
            if k <= 0:
                continue
            # Simple smile adjustment: OTM options have slightly higher IV
            moneyness = abs(math.log(self.spot / k))
            adj_iv = self.iv * (1 + 0.5 * moneyness)   # crude skew proxy

            ce = black_scholes(self.spot, k, self.T, adj_iv, "CE", self.risk_free)
            pe = black_scholes(self.spot, k, self.T, adj_iv, "PE", self.risk_free)
            strikes[k] = Strike(
                strike=k,
                ce=ce,
                pe=pe,
                is_atm=(k == atm),
                is_itm_ce=(k < self.spot),
                is_itm_pe=(k > self.spot),
            )
        return strikes

    def _round_to_interval(self, price: float) -> float:
        return round(price / self.interval) * self.interval

    @property
    def strikes(self) -> dict[float, Strike]:
        if self._strikes is None:
            self._strikes = self._build()
        return self._strikes

    def atm_strike(self) -> float:
        return self._round_to_interval(self.spot)

    def get_strike(self, strike: float) -> Strike | None:
        k = self._round_to_interval(strike)
        return self.strikes.get(k)

    def otm_strikes(self, option_type: str, n: int = 1) -> list[Strike]:
        """
        Return n OTM strikes sorted nearest-to-farthest from ATM.
        option_type: 'CE' or 'PE'
        """
        atm = self.atm_strike()
        if option_type == "CE":
            candidates = sorted(
                [s for k, s in self.strikes.items() if k > atm],
                key=lambda s: s.strike,
            )
        else:
            candidates = sorted(
                [s for k, s in self.strikes.items() if k < atm],
                key=lambda s: -s.strike,
            )
        return candidates[:n]

    def nth_otm(self, option_type: str, n: int = 1) -> Strike | None:
        """1-indexed: nth_otm('CE', 1) = first OTM CE strike."""
        hits = self.otm_strikes(option_type, n)
        return hits[n - 1] if len(hits) >= n else None

    def select_by_delta(self, option_type: str, target_delta: float) -> Strike | None:
        """Find the strike whose delta is closest to target_delta."""
        target = abs(target_delta)
        best: Strike | None = None
        best_diff = float("inf")
        for s in self.strikes.values():
            greeks = s.ce if option_type == "CE" else s.pe
            diff = abs(abs(greeks.delta) - target)
            if diff < best_diff:
                best_diff = diff
                best = s
        return best
