"""Paper trading REST endpoints."""

from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from ....dependencies import DBConn, CurrentUser
from ....services import paper_trading as svc
from ....exceptions import AppError

router = APIRouter(prefix="/paper", tags=["paper-trading"])


# ── Request schemas ───────────────────────────────────────────────────────────

class PlaceOrderIn(BaseModel):
    token:            str
    transaction_type: str
    order_type:       str
    quantity:         int
    price:            float | None = None  # required for LIMIT orders

    @field_validator("transaction_type")
    @classmethod
    def validate_tx(cls, v: str) -> str:
        v = v.upper()
        if v not in ("BUY", "SELL"):
            raise ValueError("transaction_type must be BUY or SELL")
        return v

    @field_validator("order_type")
    @classmethod
    def validate_ot(cls, v: str) -> str:
        v = v.upper()
        if v not in ("MARKET", "LIMIT"):
            raise ValueError("order_type must be MARKET or LIMIT")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_qty(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("quantity must be positive")
        return v


class CancelOrderIn(BaseModel):
    order_id: UUID


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/orders/place")
async def place_order(body: PlaceOrderIn, conn: DBConn, user_id: CurrentUser) -> dict:
    if body.order_type == "MARKET":
        return await svc.place_market_order(conn, user_id, body.token, body.transaction_type, body.quantity)

    if body.price is None:
        raise AppError("price is required for LIMIT orders", status_code=400, code="MISSING_PRICE")
    try:
        limit_price = Decimal(str(body.price))
    except InvalidOperation:
        raise AppError("Invalid price value", status_code=400, code="INVALID_PRICE")

    return await svc.place_limit_order(
        conn, user_id, body.token, body.transaction_type, body.quantity, limit_price
    )


@router.post("/orders/cancel")
async def cancel_order(body: CancelOrderIn, conn: DBConn, user_id: CurrentUser) -> dict:
    return await svc.cancel_order(conn, user_id, body.order_id)


@router.get("/portfolio/positions")
async def get_positions(conn: DBConn, user_id: CurrentUser) -> dict:
    rows = await conn.fetch(
        """SELECT p.position_id, p.token, p.symbol, p.exch_seg,
                  p.quantity, p.average_price,
                  a.ltp, a.high, a.low, a.close
           FROM user_positions p
           LEFT JOIN angle_scrip a ON a.token = p.token
           WHERE p.user_id = $1
           ORDER BY p.symbol""",
        user_id,
    )
    positions = []
    for r in rows:
        avg     = float(r["average_price"])
        ltp     = float(r["ltp"]) if r["ltp"] is not None else avg
        pnl     = (ltp - avg) * r["quantity"]
        pnl_pct = ((ltp - avg) / avg * 100) if avg else 0.0
        positions.append({
            "position_id":   str(r["position_id"]),
            "token":         r["token"],
            "symbol":        r["symbol"],
            "exch_seg":      r["exch_seg"],
            "quantity":      r["quantity"],
            "average_price": avg,
            "ltp":           ltp,
            "high":          float(r["high"])  if r["high"]  is not None else None,
            "low":           float(r["low"])   if r["low"]   is not None else None,
            "prev_close":    float(r["close"]) if r["close"] is not None else None,
            "pnl":           round(pnl, 2),
            "pnl_pct":       round(pnl_pct, 2),
        })
    return {"positions": positions, "count": len(positions)}


@router.get("/portfolio/orders")
async def get_orders(conn: DBConn, user_id: CurrentUser) -> dict:
    rows = await conn.fetch(
        """SELECT order_id, token, symbol, exch_seg, transaction_type, order_type,
                  price, quantity, status, rejection_reason, created_at
           FROM paper_orders
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 200""",
        user_id,
    )
    return {
        "orders": [
            {
                "order_id":         str(r["order_id"]),
                "token":            r["token"],
                "symbol":           r["symbol"],
                "exch_seg":         r["exch_seg"],
                "transaction_type": r["transaction_type"],
                "order_type":       r["order_type"],
                "price":            float(r["price"]),
                "quantity":         r["quantity"],
                "status":           r["status"],
                "rejection_reason": r["rejection_reason"],
                "created_at":       r["created_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/user/balance")
async def get_balance(conn: DBConn, user_id: CurrentUser) -> dict:
    row = await conn.fetchrow(
        "SELECT balance, locked_balance FROM user_balances WHERE user_id=$1",
        user_id,
    )
    if not row:
        return {"total": 1_000_000.0, "locked_balance": 0.0, "available": 1_000_000.0}
    bal    = float(row["balance"])
    locked = float(row["locked_balance"])
    return {"total": bal + locked, "locked_balance": locked, "available": bal}
