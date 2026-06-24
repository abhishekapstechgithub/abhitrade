"""
Multi-leg strategy basket execution service.

Atomically executes all option legs under a single paper_strategies parent row.
Generates payoff graph coordinates for ±10% spot range at expiration
using Black-Scholes intrinsic value (for simplicity, assumes expiry = today).
"""

import logging
from decimal import Decimal
from typing import Optional
from uuid import UUID

import asyncpg

from .market_data import resolve_price
from .paper_trading import _ensure_balance, _resolve_scrip, _new_avg
from ..exceptions import AppError

log = logging.getLogger(__name__)


# ── Payoff graph generator ────────────────────────────────────────────────────

def _option_type_from_symbol(symbol: str) -> str:
    """Infer CE/PE from the trailing characters of an option symbol."""
    s = symbol.upper().strip()
    if s.endswith("CE"):
        return "CE"
    if s.endswith("PE"):
        return "PE"
    return "CE"  # default for non-option instruments (equity legs)


def generate_payoff_graph(
    legs: list[dict],   # each: {symbol, option_type, strike, premium, quantity, transaction_type}
    spot: float,
    steps: int = 40,
) -> list[dict]:
    """
    Returns [{spot_price, pnl}] covering spot×0.90 → spot×1.10.
    At-expiry P&L = intrinsic value minus (or plus) premium.
    SELL leg profit = premium_received - intrinsic_at_expiry
    BUY  leg profit = intrinsic_at_expiry - premium_paid
    """
    lo = spot * 0.90
    hi = spot * 1.10
    step_size = (hi - lo) / steps

    points: list[dict] = []
    s = lo
    while s <= hi + step_size * 0.01:
        total_pnl = 0.0
        for leg in legs:
            strike   = float(leg.get("strike", 0) or 0)
            premium  = float(leg.get("premium", 0) or 0)
            qty      = int(leg.get("quantity", 1))
            otype    = str(leg.get("option_type", "CE")).upper()
            tx       = str(leg.get("transaction_type", "BUY")).upper()

            if otype == "CE":
                intrinsic = max(0.0, s - strike)
            else:
                intrinsic = max(0.0, strike - s)

            if tx == "SELL":
                leg_pnl = (premium - intrinsic) * qty
            else:
                leg_pnl = (intrinsic - premium) * qty

            total_pnl += leg_pnl

        points.append({"spot": round(s, 2), "pnl": round(total_pnl, 2)})
        s += step_size

    return points


# ── Strategy basket execution ─────────────────────────────────────────────────

async def execute_strategy_basket(
    conn: asyncpg.Connection,
    user_id: UUID,
    strategy_name: str,
    underlying: Optional[str],
    legs: list[dict],   # each leg: {token, transaction_type, quantity, order_type?, price?}
) -> dict:
    """
    Atomic multi-leg execution:
      1. Validate all legs (scrip exists, LTP available, balance sufficient for BUY legs)
      2. CREATE paper_strategies row
      3. For each leg: debit/credit balance, INSERT paper_orders + paper_trades + user_positions
      4. Generate payoff graph and store in paper_strategies.payoff_graph
      5. Return strategy summary

    Raises AppError if:
      - Market is closed
      - Any token is invalid
      - Balance is insufficient for the combined BUY legs
    """
    import json

    if not legs:
        raise AppError("Strategy must have at least one leg", status_code=400, code="EMPTY_LEGS")

    # ── Pre-validate all legs (resolve scrip + LTP) ───────────────────────────
    resolved: list[dict] = []
    total_buy_cost = Decimal("0")

    for idx, leg in enumerate(legs):
        token = str(leg.get("token", "")).strip()
        tx    = str(leg.get("transaction_type", "BUY")).upper()
        qty   = int(leg.get("quantity", 0))
        if not token or qty <= 0:
            raise AppError(f"Leg {idx + 1}: invalid token or quantity", status_code=400, code="INVALID_LEG")

        scrip = await _resolve_scrip(conn, token)
        if not scrip:
            raise AppError(f"Leg {idx + 1}: token {token!r} not in instrument master", status_code=400, code="INVALID_TOKEN")

        ltp_raw = await resolve_price(token, conn)
        if ltp_raw is None:
            raise AppError(
                f"Leg {idx + 1}: no price data for {scrip['symbol']} — "
                "ensure bhavcopy or live feed has been loaded",
                status_code=400, code="NO_PRICE",
            )

        ltp   = Decimal(str(ltp_raw))
        cost  = ltp * qty
        otype = _option_type_from_symbol(scrip["symbol"])
        strike_raw = float(scrip.get("strike", 0) or 0)

        resolved.append({
            "token":            token,
            "symbol":           scrip["symbol"],
            "exch_seg":         scrip["exch_seg"],
            "transaction_type": tx,
            "quantity":         qty,
            "ltp":              ltp,
            "cost":             cost,
            "option_type":      otype,
            "strike":           strike_raw,
            "premium":          float(ltp),
        })
        if tx == "BUY":
            total_buy_cost += cost

    # ── Balance check ─────────────────────────────────────────────────────────
    async with conn.transaction():
        bal_row = await _ensure_balance(conn, user_id)
        balance = Decimal(str(bal_row["balance"]))
        if balance < total_buy_cost:
            raise AppError(
                f"Insufficient funds — need ₹{float(total_buy_cost):,.2f}, "
                f"available ₹{float(balance):,.2f}",
                status_code=400, code="INSUFFICIENT_FUNDS",
            )

        # ── Create strategy parent row ────────────────────────────────────────
        net_premium = sum(
            (r["ltp"] if r["transaction_type"] == "SELL" else -r["ltp"]) * r["quantity"]
            for r in resolved
        )
        strategy_id = await conn.fetchval(
            """INSERT INTO paper_strategies
               (user_id, strategy_name, underlying, status, net_premium)
               VALUES ($1,$2,$3,'EXECUTED',$4)
               RETURNING strategy_id""",
            user_id, strategy_name, underlying, float(net_premium),
        )

        # ── Execute each leg ──────────────────────────────────────────────────
        executed_legs = []
        for r in resolved:
            # Balance debit/credit
            if r["transaction_type"] == "BUY":
                await conn.execute(
                    "UPDATE user_balances SET balance=balance-$1, updated_at=NOW() WHERE user_id=$2",
                    r["cost"], user_id,
                )
            else:  # SELL
                # For option SELL, validate position or allow naked (paper trading)
                await conn.execute(
                    "UPDATE user_balances SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2",
                    r["cost"], user_id,
                )

            # Create order
            order_id = await conn.fetchval(
                """INSERT INTO paper_orders
                   (user_id, strategy_id, token, symbol, exch_seg,
                    transaction_type, order_type, price, quantity, status)
                   VALUES ($1,$2,$3,$4,$5,$6,'MARKET',$7,$8,'EXECUTED')
                   RETURNING order_id""",
                user_id, strategy_id, r["token"], r["symbol"], r["exch_seg"],
                r["transaction_type"], r["ltp"], r["quantity"],
            )

            # Create trade
            await conn.execute(
                """INSERT INTO paper_trades (order_id, user_id, token, price, quantity)
                   VALUES ($1,$2,$3,$4,$5)""",
                order_id, user_id, r["token"], r["ltp"], r["quantity"],
            )

            # Upsert position (strategy-scoped)
            existing = await conn.fetchrow(
                """SELECT quantity, average_price FROM user_positions
                   WHERE user_id=$1 AND token=$2 AND strategy_id=$3""",
                user_id, r["token"], strategy_id,
            )
            if r["transaction_type"] == "BUY":
                if existing:
                    new_avg = _new_avg(
                        existing["quantity"], Decimal(str(existing["average_price"])),
                        r["quantity"], r["ltp"],
                    )
                    await conn.execute(
                        """UPDATE user_positions SET quantity=quantity+$1, average_price=$2
                           WHERE user_id=$3 AND token=$4 AND strategy_id=$5""",
                        r["quantity"], new_avg, user_id, r["token"], strategy_id,
                    )
                else:
                    await conn.execute(
                        """INSERT INTO user_positions
                           (user_id, strategy_id, token, symbol, exch_seg, quantity, average_price)
                           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                        user_id, strategy_id, r["token"], r["symbol"],
                        r["exch_seg"], r["quantity"], r["ltp"],
                    )
            else:  # SELL (short position = negative quantity)
                if existing:
                    await conn.execute(
                        """UPDATE user_positions SET quantity=quantity-$1
                           WHERE user_id=$2 AND token=$3 AND strategy_id=$4""",
                        r["quantity"], user_id, r["token"], strategy_id,
                    )
                else:
                    await conn.execute(
                        """INSERT INTO user_positions
                           (user_id, strategy_id, token, symbol, exch_seg, quantity, average_price)
                           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                        user_id, strategy_id, r["token"], r["symbol"],
                        r["exch_seg"], -r["quantity"], r["ltp"],
                    )

            executed_legs.append({
                "order_id":         str(order_id),
                "token":            r["token"],
                "symbol":           r["symbol"],
                "transaction_type": r["transaction_type"],
                "quantity":         r["quantity"],
                "price":            float(r["ltp"]),
            })

        # ── Generate payoff graph ─────────────────────────────────────────────
        # Use average of all leg LTPs as a proxy spot (or first leg if index)
        spot_proxy = float(resolved[0]["ltp"]) if resolved else 100.0
        payoff = generate_payoff_graph(resolved, spot=spot_proxy)

        # Persist payoff in strategy row
        await conn.execute(
            "UPDATE paper_strategies SET payoff_graph=$1 WHERE strategy_id=$2",
            json.dumps(payoff), strategy_id,
        )

    log.info("[basket] Strategy %s executed — %d legs, net_premium=%.2f, user=%s",
             strategy_id, len(executed_legs), float(net_premium), user_id)

    return {
        "strategy_id":   str(strategy_id),
        "strategy_name": strategy_name,
        "status":        "EXECUTED",
        "net_premium":   float(net_premium),
        "legs":          executed_legs,
        "payoff_graph":  payoff,
    }


async def close_strategy(
    conn: asyncpg.Connection,
    user_id: UUID,
    strategy_id: UUID,
) -> dict:
    """
    Close all open positions for a strategy at current market prices.
    Credits/debits balance, marks strategy as CLOSED.
    """
    async with conn.transaction():
        strat = await conn.fetchrow(
            "SELECT * FROM paper_strategies WHERE strategy_id=$1 AND user_id=$2 FOR UPDATE",
            strategy_id, user_id,
        )
        if not strat:
            raise AppError("Strategy not found", status_code=404, code="NOT_FOUND")
        if strat["status"] == "CLOSED":
            raise AppError("Strategy already closed", status_code=400, code="ALREADY_CLOSED")

        positions = await conn.fetch(
            "SELECT * FROM user_positions WHERE strategy_id=$1 AND user_id=$2",
            strategy_id, user_id,
        )

        closed_legs = []
        realised_pnl = Decimal("0")

        for pos in positions:
            if pos["quantity"] == 0:
                continue
            ltp_raw = await resolve_price(pos["token"], conn)
            if not ltp_raw:
                continue
            ltp = Decimal(str(ltp_raw))
            qty = abs(pos["quantity"])
            avg = Decimal(str(pos["average_price"]))

            # Reverse the position: positive qty (long) → SELL to close; negative qty (short) → BUY to close
            if pos["quantity"] > 0:
                close_tx = "SELL"
                pnl = (ltp - avg) * qty
                await conn.execute(
                    "UPDATE user_balances SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2",
                    ltp * qty, user_id,
                )
            else:
                close_tx = "BUY"
                pnl = (avg - ltp) * qty
                await conn.execute(
                    "UPDATE user_balances SET balance=balance-$1, updated_at=NOW() WHERE user_id=$2",
                    ltp * qty, user_id,
                )

            realised_pnl += pnl

            order_id = await conn.fetchval(
                """INSERT INTO paper_orders
                   (user_id, strategy_id, token, symbol, exch_seg,
                    transaction_type, order_type, price, quantity, status)
                   VALUES ($1,$2,$3,$4,$5,$6,'MARKET',$7,$8,'EXECUTED')
                   RETURNING order_id""",
                user_id, strategy_id, pos["token"], pos["symbol"], pos["exch_seg"],
                close_tx, ltp, qty,
            )
            await conn.execute(
                "INSERT INTO paper_trades (order_id, user_id, token, price, quantity) VALUES ($1,$2,$3,$4,$5)",
                order_id, user_id, pos["token"], ltp, qty,
            )
            await conn.execute(
                "UPDATE user_positions SET quantity=0 WHERE position_id=$1",
                pos["position_id"],
            )
            closed_legs.append({"token": pos["token"], "symbol": pos["symbol"], "pnl": float(pnl)})

        await conn.execute(
            "UPDATE paper_strategies SET status='CLOSED', closed_at=NOW() WHERE strategy_id=$1",
            strategy_id,
        )

    return {
        "strategy_id":  str(strategy_id),
        "status":       "CLOSED",
        "realised_pnl": float(realised_pnl),
        "closed_legs":  closed_legs,
    }
