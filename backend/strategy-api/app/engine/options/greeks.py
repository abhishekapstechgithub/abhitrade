"""
Black-Scholes option pricing for Indian index options.

Supports European-style options (NSE index options = European).
Equity options are American but we use BS as an approximation for backtesting.

All parameters follow the standard BS convention:
  S  = spot price
  K  = strike price
  T  = time to expiry in years  (e.g. 7 days → 7/365)
  r  = risk-free rate (annualised, e.g. 0.065 for 6.5%)
  σ  = implied volatility (annualised, e.g. 0.15 for 15%)
"""

from __future__ import annotations
import math
from dataclasses import dataclass

_SQRT_2PI = math.sqrt(2 * math.pi)
_DEFAULT_R = 0.065   # RBI repo rate proxy


def _norm_cdf(x: float) -> float:
    """Approximation of Φ(x) — accurate to 7 significant figures."""
    return 0.5 * math.erfc(-x / math.sqrt(2))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT_2PI


def _d1d2(S: float, K: float, T: float, r: float, sigma: float) -> tuple[float, float]:
    if T <= 0 or sigma <= 0:
        return 0.0, 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return d1, d2


@dataclass
class OptionGreeks:
    price:  float
    delta:  float
    gamma:  float
    theta:  float   # per calendar day
    vega:   float   # per 1% move in IV
    rho:    float
    iv:     float


def black_scholes(
    S: float,
    K: float,
    T: float,
    sigma: float,
    option_type: str = "CE",
    r: float = _DEFAULT_R,
) -> OptionGreeks:
    """
    Compute BS price and all Greeks.

    option_type: 'CE' or 'PE'
    Returns OptionGreeks with per-day theta and per-1%-IV vega.
    """
    if T <= 0:
        # At expiry — intrinsic value only
        intrinsic = max(S - K, 0) if option_type == "CE" else max(K - S, 0)
        return OptionGreeks(price=intrinsic, delta=1.0 if intrinsic > 0 else 0.0,
                            gamma=0.0, theta=0.0, vega=0.0, rho=0.0, iv=sigma)

    d1, d2 = _d1d2(S, K, T, r, sigma)
    sq_T   = math.sqrt(T)
    disc   = math.exp(-r * T)

    if option_type == "CE":
        price  = S * _norm_cdf(d1) - K * disc * _norm_cdf(d2)
        delta  = _norm_cdf(d1)
        rho    = K * T * disc * _norm_cdf(d2) / 100
    else:
        price  = K * disc * _norm_cdf(-d2) - S * _norm_cdf(-d1)
        delta  = _norm_cdf(d1) - 1
        rho    = -K * T * disc * _norm_cdf(-d2) / 100

    gamma  = _norm_pdf(d1) / (S * sigma * sq_T)
    # Theta raw (annualised) → divide by 365 for per-day
    theta_raw = (
        -(S * _norm_pdf(d1) * sigma) / (2 * sq_T)
        - r * K * disc * (_norm_cdf(d2) if option_type == "CE" else _norm_cdf(-d2))
    )
    theta = theta_raw / 365
    vega  = S * _norm_pdf(d1) * sq_T / 100   # per 1% IV

    price = max(price, 0.0)
    return OptionGreeks(
        price=round(price, 2),
        delta=round(delta, 4),
        gamma=round(gamma, 6),
        theta=round(theta, 4),
        vega=round(vega, 4),
        rho=round(rho, 4),
        iv=sigma,
    )


def implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    option_type: str = "CE",
    r: float = _DEFAULT_R,
    tol: float = 1e-5,
    max_iter: int = 100,
) -> float | None:
    """
    Newton-Raphson solver for implied volatility.
    Returns None if it doesn't converge (deep ITM/OTM, very short-dated, etc.).
    """
    if T <= 0 or market_price <= 0:
        return None

    sigma = 0.3   # starting guess
    for _ in range(max_iter):
        g = black_scholes(S, K, T, sigma, option_type, r)
        diff = g.price - market_price
        if abs(diff) < tol:
            return round(sigma, 6)
        vega_raw = g.vega * 100   # un-scale back to per 1 unit sigma
        if vega_raw < 1e-10:
            return None
        sigma -= diff / vega_raw
        sigma = max(0.001, min(sigma, 20.0))   # clamp to reasonable range
    return None
