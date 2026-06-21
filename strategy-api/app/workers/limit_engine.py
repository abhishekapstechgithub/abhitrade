"""
Limit order matching engine — background asyncio task.

Polls every 2 seconds for PENDING orders and checks price from:
  1. Redis (fast path — ws-live.ts feed)
  2. Postgres market_quotes / angle_scrip (fallback when feed is offline)

No Angel One connection is required — all prices come from what ws-live.ts
already stored in Redis/Postgres.
"""

import asyncio
import logging
from decimal import Decimal

from ..database import get_pool
from ..services.market_data import get_ltp_by_token, resolve_price

log = logging.getLogger(__name__)


async def _resolve_limit_price(token: str, conn) -> float | None:
    """
    Try Redis first (fast), then fall back to Postgres.
    The Postgres fallback ensures limit orders can match even when
    Angel One feed is not live (e.g. off-hours, EOD prices).
    """
    ltp = await get_ltp_by_token(token)
    if ltp is not None:
        return ltp
    return await resolve_price(token, conn)


async def _process_pending() -> None:
    pool = get_pool()

    # Fetch all pending orders
    async with pool.acquire() as conn:
        pending = await conn.fetch(
            """SELECT order_id, user_id, token, symbol, exch_seg,
                      transaction_type, price, quantity, strategy_id
               FROM paper_orders WHERE status='PENDING'
               ORDER BY created_at"""
        )

    if not pending:
        return

    for order in pending:
        # Resolve current price (Redis → Postgres fallback)
        async with pool.acquire() as conn:
            ltp = await _resolve_limit_price(order["token"], conn)

        if ltp is None:
            continue  # no price available — skip this cycle

        ltp_d   = Decimal(str(ltp))
        limit_d = Decimal(str(order["price"]))

        triggered = (
            (order["transaction_type"] == "BUY"  and ltp_d <= limit_d) or
            (order["transaction_type"] == "SELL" and ltp_d >= limit_d)
        )
        if not triggered:
            continue

        # Execute the triggered order
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Re-read with lock to guard against concurrent execution
                current = await conn.fetchrow(
                    "SELECT status FROM paper_orders WHERE order_id=$1 FOR UPDATE",
                    order["order_id"],
                )
                if not current or current["status"] != "PENDING":
                    continue  # already executed or cancelled

                exec_price = ltp_d
                total      = exec_price * order["quantity"]
                strategy_id = order["strategy_id"]

                if order["transaction_type"] == "BUY":
                    # Unfreeze locked margin; adjust for any price difference
                    locked = limit_d * order["quantity"]
                    await conn.execute(
                        """UPDATE user_balances
                           SET locked_balance = GREATEST(0, locked_balance - $1),
                               balance        = balance + ($1 - $2),
                               updated_at     = NOW()
                           WHERE user_id = $3""",
                        locked, total, order["user_id"],
                    )
                else:  # SELL
                    await conn.execute(
                        "UPDATE user_balances SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2",
                        total, order["user_id"],
                    )

                # Mark order executed
                await conn.execute(
                    "UPDATE paper_orders SET status='EXECUTED', price=$1 WHERE order_id=$2",
                    exec_price, order["order_id"],
                )

                # Create trade record
                await conn.execute(
                    "INSERT INTO paper_trades (order_id, user_id, token, price, quantity) VALUES ($1,$2,$3,$4,$5)",
                    order["order_id"], order["user_id"], order["token"], exec_price, order["quantity"],
                )

                # Update positions (strategy-aware)
                if order["transaction_type"] == "BUY":
                    existing = await conn.fetchrow(
                        """SELECT quantity, average_price FROM user_positions
                           WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                        order["user_id"], order["token"], strategy_id,
                    )
                    if existing:
                        new_avg = (
                            existing["quantity"] * Decimal(str(existing["average_price"])) +
                            order["quantity"] * exec_price
                        ) / (existing["quantity"] + order["quantity"])
                        await conn.execute(
                            """UPDATE user_positions SET quantity=quantity+$1, average_price=$2
                               WHERE user_id=$3 AND token=$4 AND strategy_id IS NOT DISTINCT FROM $5""",
                            order["quantity"], new_avg, order["user_id"], order["token"], strategy_id,
                        )
                    else:
                        await conn.execute(
                            """INSERT INTO user_positions
                               (user_id, strategy_id, token, symbol, exch_seg, quantity, average_price)
                               VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                            order["user_id"], strategy_id, order["token"],
                            order["symbol"], order["exch_seg"], order["quantity"], exec_price,
                        )
                else:  # SELL
                    cur = await conn.fetchval(
                        """SELECT quantity FROM user_positions
                           WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                        order["user_id"], order["token"], strategy_id,
                    ) or 0
                    new_qty = cur - order["quantity"]
                    if new_qty <= 0:
                        await conn.execute(
                            """DELETE FROM user_positions
                               WHERE user_id=$1 AND token=$2 AND strategy_id IS NOT DISTINCT FROM $3""",
                            order["user_id"], order["token"], strategy_id,
                        )
                    else:
                        await conn.execute(
                            """UPDATE user_positions SET quantity=$1
                               WHERE user_id=$2 AND token=$3 AND strategy_id IS NOT DISTINCT FROM $4""",
                            new_qty, order["user_id"], order["token"], strategy_id,
                        )

                log.info("[limit-engine] %s %s x%d @ %.2f  user=%s",
                         order["transaction_type"], order["symbol"],
                         order["quantity"], exec_price, order["user_id"])


async def run_limit_engine() -> None:
    log.info("[limit-engine] Started — polling every 2 s (Redis + Postgres price fallback)")
    while True:
        try:
            await _process_pending()
        except Exception as e:
            log.warning("[limit-engine] Error: %s", e)
        await asyncio.sleep(2)
