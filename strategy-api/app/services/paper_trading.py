"""
Paper trading execution engine — ACID-compliant, fully virtual.

Key design rules:
  - Prices are NEVER accepted from the client payload.
  - Prices are resolved internally via resolve_price() which checks Redis first,
    then falls back to Postgres (market_quotes → angle_scrip EOD).
  - This means paper trading works whether Angel One is live or offline.
  - No real money, no real orders — all state lives in PostgreSQL.
  - Market hours guard is DISABLED for paper trading (virtual = 24/7).
"""

import logging
from decimal import Decimal
from typing import Optional
from uuid import UUID

import asyncpg

from .market_data import resolve_price
from ..exceptions import AppError

log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _ensure_balance(conn: asyncpg.Connection, user_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(
        "SELECT balance, locked_balance FROM user_balances WHERE user_id=$1 FOR UPDATE",
        user_id,
    )
    if row is None:
        await conn.execute(
            "INSERT INTO user_balances (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
            user_id,
        )
        row = await conn.fetchrow(
            "SELECT balance, locked_balance FROM user_balances WHERE user_id=$1 FOR UPDATE",
            user_id,
        )
    return row  # type: ignore[return-value]


async def _resolve_scrip(conn: asyncpg.Connection, token: str) -> Optional[asyncpg.Record]:
    return await conn.fetchrow(
        "SELECT token, symbol, exch_seg, lotsize FROM angle_scrip WHERE token=$1",
        token,
    )


def _new_avg(cur_qty: int, cur_avg: Decimal, add_qty: int, add_price: Decimal) -> Decimal:
    return (cur_qty * cur_avg + add_qty * add_price) / (cur_qty + add_qty)


# ── Market order ──────────────────────────────────────────────────────────────

async def place_market_order(
    conn: asyncpg.Connection,
    user_id: UUID,
    token: str,
    transaction_type: str,  # BUY | SELL
    quantity: int,
    strategy_id: Optional[UUID] = None,
) -> dict:
    """
    Place a virtual market order at the last known price.

    Price source priority:
      1. Redis live feed (ws-live.ts, updated every 3 s)
      2. Postgres market_quotes (last persisted live price)
      3. Postgres angle_scrip.ltp (EOD / bhavcopy price)
    No Angel One connection is required — the price is resolved entirely
    from what is already stored in Redis and Postgres.
    """
    scrip = await _resolve_scrip(conn, token)
    if not scrip:
        raise AppError(
            f"Instrument token '{token}' not found — run scrip sync or check your search result",
            status_code=400, code="INVALID_TOKEN",
        )

    # Resolve price from Redis → Postgres fallback chain
    ltp_raw = await resolve_price(token, conn)
    if ltp_raw is None:
        raise AppError(
            f"No price data available for {scrip['symbol']}. "
            "Price will be available once Angel One market feed connects or bhavcopy is loaded.",
            status_code=400, code="NO_PRICE",
        )

    ltp        = Decimal(str(ltp_raw))
    total_cost = ltp * quantity

    async with conn.transaction():
        balance_row = await _ensure_balance(conn, user_id)
        balance     = Decimal(str(balance_row["balance"]))

        if transaction_type == "BUY":
            if balance < total_cost:
                oid = await conn.fetchval(
                    """INSERT INTO paper_orders
                       (user_id, strategy_id, token, symbol, exch_seg,
                        transaction_type, order_type, price, quantity, status, rejection_reason)
                       VALUES ($1,$2,$3,$4,$5,$6,'MARKET',$7,$8,'REJECTED','Insufficient Funds')
                       RETURNING order_id""",
                    user_id, strategy_id, scrip["token"], scrip["symbol"], scrip["exch_seg"],
                    transaction_type, ltp, quantity,
                )
                return {
                    "status":   "REJECTED",
                    "reason":   "Insufficient Funds",
                    "order_id": str(oid),
                    "required": float(total_cost),
                    "available": float(balance),
                }

            await conn.execute(
                "UPDATE user_balances SET balance=balance-$1, updated_at=NOW() WHERE user_id=$2",
                total_cost, user_id,
            )

        else:  # SELL
            pos = await conn.fetchrow(
                """SELECT quantity FROM user_positions
                   WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                user_id, token, strategy_id,
            )
            if not pos or pos["quantity"] < quantity:
                held = pos["quantity"] if pos else 0
                oid  = await conn.fetchval(
                    """INSERT INTO paper_orders
                       (user_id, strategy_id, token, symbol, exch_seg,
                        transaction_type, order_type, price, quantity, status, rejection_reason)
                       VALUES ($1,$2,$3,$4,$5,$6,'MARKET',$7,$8,'REJECTED','Insufficient Holdings')
                       RETURNING order_id""",
                    user_id, strategy_id, scrip["token"], scrip["symbol"], scrip["exch_seg"],
                    transaction_type, ltp, quantity,
                )
                return {
                    "status":   "REJECTED",
                    "reason":   "Insufficient Holdings",
                    "order_id": str(oid),
                    "held":     held,
                    "requested": quantity,
                }

            await conn.execute(
                "UPDATE user_balances SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2",
                total_cost, user_id,
            )

        # Create order record
        oid = await conn.fetchval(
            """INSERT INTO paper_orders
               (user_id, strategy_id, token, symbol, exch_seg,
                transaction_type, order_type, price, quantity, status)
               VALUES ($1,$2,$3,$4,$5,$6,'MARKET',$7,$8,'EXECUTED')
               RETURNING order_id""",
            user_id, strategy_id, scrip["token"], scrip["symbol"], scrip["exch_seg"],
            transaction_type, ltp, quantity,
        )

        # Create trade audit record
        await conn.execute(
            "INSERT INTO paper_trades (order_id, user_id, token, price, quantity) VALUES ($1,$2,$3,$4,$5)",
            oid, user_id, token, ltp, quantity,
        )

        # Update positions
        if transaction_type == "BUY":
            existing = await conn.fetchrow(
                """SELECT quantity, average_price FROM user_positions
                   WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                user_id, token, strategy_id,
            )
            if existing:
                new_avg = _new_avg(
                    existing["quantity"], Decimal(str(existing["average_price"])),
                    quantity, ltp,
                )
                await conn.execute(
                    """UPDATE user_positions SET quantity=quantity+$1, average_price=$2
                       WHERE user_id=$3 AND token=$4 AND strategy_id IS NOT DISTINCT FROM $5""",
                    quantity, new_avg, user_id, token, strategy_id,
                )
            else:
                await conn.execute(
                    """INSERT INTO user_positions
                       (user_id, strategy_id, token, symbol, exch_seg, quantity, average_price)
                       VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                    user_id, strategy_id, token, scrip["symbol"], scrip["exch_seg"], quantity, ltp,
                )
        else:  # SELL
            cur_qty = await conn.fetchval(
                """SELECT quantity FROM user_positions
                   WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                user_id, token, strategy_id,
            ) or 0
            new_qty = cur_qty - quantity
            if new_qty == 0:
                await conn.execute(
                    """DELETE FROM user_positions
                       WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                    user_id, token, strategy_id,
                )
            else:
                await conn.execute(
                    """UPDATE user_positions SET quantity=$1
                       WHERE user_id=$2 AND token=$3 AND strategy_id IS NOT DISTINCT FROM $4""",
                    new_qty, user_id, token, strategy_id,
                )

    log.info("[paper] %s MARKET %s x%d @ %.2f  user=%s  strategy=%s",
             transaction_type, scrip["symbol"], quantity, ltp, user_id, strategy_id)

    return {
        "status":   "EXECUTED",
        "order_id": str(oid),
        "symbol":   scrip["symbol"],
        "price":    float(ltp),
        "quantity": quantity,
        "total":    float(total_cost),
    }


# ── Limit order ───────────────────────────────────────────────────────────────

async def place_limit_order(
    conn: asyncpg.Connection,
    user_id: UUID,
    token: str,
    transaction_type: str,
    quantity: int,
    limit_price: Decimal,
    strategy_id: Optional[UUID] = None,
) -> dict:
    """
    Place a virtual limit order.
    Freezes margin in locked_balance for BUY orders.
    The limit engine polls every 2 s and executes when LTP crosses the target.
    """
    scrip = await _resolve_scrip(conn, token)
    if not scrip:
        raise AppError(
            f"Instrument token '{token}' not found",
            status_code=400, code="INVALID_TOKEN",
        )

    estimated_cost = limit_price * quantity

    async with conn.transaction():
        if transaction_type == "BUY":
            balance_row = await _ensure_balance(conn, user_id)
            if Decimal(str(balance_row["balance"])) < estimated_cost:
                raise AppError(
                    f"Insufficient funds — need ₹{float(estimated_cost):,.2f} to place limit order",
                    status_code=400, code="INSUFFICIENT_FUNDS",
                )
            # Freeze margin
            await conn.execute(
                """UPDATE user_balances
                   SET balance=balance-$1, locked_balance=locked_balance+$1, updated_at=NOW()
                   WHERE user_id=$2""",
                estimated_cost, user_id,
            )
        else:  # SELL
            pos = await conn.fetchrow(
                """SELECT quantity FROM user_positions
                   WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                user_id, token, strategy_id,
            )
            if not pos or pos["quantity"] < quantity:
                raise AppError(
                    "Insufficient holdings for limit sell order",
                    status_code=400, code="INSUFFICIENT_HOLDINGS",
                )

        oid = await conn.fetchval(
            """INSERT INTO paper_orders
               (user_id, strategy_id, token, symbol, exch_seg,
                transaction_type, order_type, price, quantity, status)
               VALUES ($1,$2,$3,$4,$5,$6,'LIMIT',$7,$8,'PENDING')
               RETURNING order_id""",
            user_id, strategy_id, scrip["token"], scrip["symbol"], scrip["exch_seg"],
            transaction_type, limit_price, quantity,
        )

    log.info("[paper] %s LIMIT %s x%d @ %.2f  user=%s",
             transaction_type, scrip["symbol"], quantity, limit_price, user_id)

    return {
        "status":      "PENDING",
        "order_id":    str(oid),
        "symbol":      scrip["symbol"],
        "limit_price": float(limit_price),
        "quantity":    quantity,
        "margin_frozen": float(estimated_cost) if transaction_type == "BUY" else 0,
    }


# ── Cancel order ──────────────────────────────────────────────────────────────

async def cancel_order(conn: asyncpg.Connection, user_id: UUID, order_id: UUID) -> dict:
    async with conn.transaction():
        order = await conn.fetchrow(
            "SELECT * FROM paper_orders WHERE order_id=$1 AND user_id=$2 FOR UPDATE",
            order_id, user_id,
        )
        if not order:
            raise AppError("Order not found", status_code=404, code="NOT_FOUND")
        if order["status"] != "PENDING":
            raise AppError(
                f"Cannot cancel — order is already {order['status']}",
                status_code=400, code="INVALID_STATUS",
            )

        await conn.execute(
            "UPDATE paper_orders SET status='CANCELLED' WHERE order_id=$1",
            order_id,
        )

        # Release locked balance for BUY limit orders
        if order["transaction_type"] == "BUY" and order["order_type"] == "LIMIT":
            locked = Decimal(str(order["price"])) * order["quantity"]
            await conn.execute(
                """UPDATE user_balances
                   SET balance=balance+$1, locked_balance=GREATEST(0, locked_balance-$1), updated_at=NOW()
                   WHERE user_id=$2""",
                locked, user_id,
            )

    return {"status": "CANCELLED", "order_id": str(order_id)}
