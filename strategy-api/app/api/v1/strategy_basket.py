"""
Multi-leg strategy basket REST endpoints.
POST /api/strategies/execute   → atomic multi-leg execution
POST /api/strategies/close     → close all positions in a strategy
GET  /api/strategies/list      → list user's paper strategies
GET  /api/strategies/{id}      → get single strategy with payoff graph
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from ...dependencies import DBConn, CurrentUser
from ...services.strategy_basket import execute_strategy_basket, close_strategy
from ...exceptions import AppError

router = APIRouter(prefix="/strategies", tags=["strategy-basket"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LegIn(BaseModel):
    token:            str
    transaction_type: str   # BUY | SELL
    quantity:         int
    order_type:       str = "MARKET"  # MARKET only for basket (LIMIT not supported in multi-leg)

    @field_validator("transaction_type")
    @classmethod
    def validate_tx(cls, v: str) -> str:
        v = v.upper()
        if v not in ("BUY", "SELL"):
            raise ValueError("transaction_type must be BUY or SELL")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_qty(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("quantity must be positive")
        return v


class ExecuteStrategyIn(BaseModel):
    strategy_name: str
    underlying:    Optional[str] = None   # e.g. "NIFTY" — used in payoff labelling
    legs:          list[LegIn]

    @field_validator("strategy_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("strategy_name cannot be empty")
        return v

    @field_validator("legs")
    @classmethod
    def validate_legs(cls, v: list[LegIn]) -> list[LegIn]:
        if len(v) < 1:
            raise ValueError("At least one leg is required")
        if len(v) > 10:
            raise ValueError("Maximum 10 legs per strategy basket")
        return v


class CloseStrategyIn(BaseModel):
    strategy_id: UUID


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/execute")
async def execute_strategy(
    body: ExecuteStrategyIn,
    conn: DBConn,
    user_id: CurrentUser,
) -> dict:
    """
    Atomically execute a multi-leg option strategy basket.

    - Validates all legs (scrip + live LTP from Redis)
    - Validates combined BUY margin against user balance
    - Creates paper_strategies parent row
    - Executes each leg (paper_orders + paper_trades + user_positions)
    - Generates payoff graph for ±10% spot range at expiration
    - Returns strategy summary + payoff coordinates
    """
    legs_data = [leg.model_dump() for leg in body.legs]
    result = await execute_strategy_basket(
        conn,
        user_id,
        body.strategy_name,
        body.underlying,
        legs_data,
    )
    return result


@router.post("/close")
async def close_strategy_endpoint(
    body: CloseStrategyIn,
    conn: DBConn,
    user_id: CurrentUser,
) -> dict:
    """
    Close all open positions in a strategy at current market prices.
    Marks strategy as CLOSED and returns realised P&L.
    """
    return await close_strategy(conn, user_id, body.strategy_id)


@router.get("/list")
async def list_strategies(
    conn: DBConn,
    user_id: CurrentUser,
    status: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """
    List all paper strategies for the current user.
    Optional ?status=EXECUTED|CLOSED filter.
    """
    if limit > 200:
        limit = 200

    if status:
        status = status.upper()
        if status not in ("EXECUTED", "CLOSED", "PENDING"):
            raise AppError("status must be EXECUTED, CLOSED, or PENDING", status_code=400, code="INVALID_STATUS")

        rows = await conn.fetch(
            """SELECT strategy_id, strategy_name, underlying, status, net_premium, created_at, closed_at
               FROM paper_strategies
               WHERE user_id=$1 AND status=$2
               ORDER BY created_at DESC LIMIT $3""",
            user_id, status, limit,
        )
    else:
        rows = await conn.fetch(
            """SELECT strategy_id, strategy_name, underlying, status, net_premium, created_at, closed_at
               FROM paper_strategies
               WHERE user_id=$1
               ORDER BY created_at DESC LIMIT $2""",
            user_id, limit,
        )

    strategies = []
    for r in rows:
        # Fetch leg count
        leg_count = await conn.fetchval(
            "SELECT COUNT(*) FROM paper_orders WHERE strategy_id=$1",
            r["strategy_id"],
        ) or 0

        strategies.append({
            "strategy_id":   str(r["strategy_id"]),
            "strategy_name": r["strategy_name"],
            "underlying":    r["underlying"],
            "status":        r["status"],
            "net_premium":   float(r["net_premium"]) if r["net_premium"] else 0.0,
            "leg_count":     leg_count,
            "created_at":    r["created_at"].isoformat(),
            "closed_at":     r["closed_at"].isoformat() if r["closed_at"] else None,
        })

    return {"strategies": strategies, "count": len(strategies)}


@router.get("/{strategy_id}")
async def get_strategy(
    strategy_id: UUID,
    conn: DBConn,
    user_id: CurrentUser,
) -> dict:
    """
    Get a single strategy with legs, positions, and payoff graph.
    """
    row = await conn.fetchrow(
        "SELECT * FROM paper_strategies WHERE strategy_id=$1 AND user_id=$2",
        strategy_id, user_id,
    )
    if not row:
        raise AppError("Strategy not found", status_code=404, code="NOT_FOUND")

    # Fetch all linked orders (legs)
    orders = await conn.fetch(
        """SELECT order_id, token, symbol, exch_seg, transaction_type,
                  order_type, price, quantity, status, created_at
           FROM paper_orders WHERE strategy_id=$1 ORDER BY created_at""",
        strategy_id,
    )

    # Fetch current positions
    positions = await conn.fetch(
        """SELECT p.position_id, p.token, p.symbol, p.exch_seg,
                  p.quantity, p.average_price,
                  a.ltp, a.high, a.low, a.close
           FROM user_positions p
           LEFT JOIN angle_scrip a ON a.token = p.token
           WHERE p.strategy_id=$1 AND p.user_id=$2""",
        strategy_id, user_id,
    )

    # Compute current strategy P&L
    total_pnl = 0.0
    pos_list  = []
    for p in positions:
        avg  = float(p["average_price"])
        ltp  = float(p["ltp"]) if p["ltp"] else avg
        qty  = p["quantity"]
        pnl  = (ltp - avg) * qty
        total_pnl += pnl
        pos_list.append({
            "position_id":   str(p["position_id"]),
            "token":         p["token"],
            "symbol":        p["symbol"],
            "exch_seg":      p["exch_seg"],
            "quantity":      qty,
            "average_price": avg,
            "ltp":           ltp,
            "high":          float(p["high"]) if p["high"] else None,
            "low":           float(p["low"])  if p["low"]  else None,
            "prev_close":    float(p["close"]) if p["close"] else None,
            "pnl":           round(pnl, 2),
        })

    import json as _json
    payoff_raw = row["payoff_graph"]
    payoff = (
        _json.loads(payoff_raw) if isinstance(payoff_raw, str)
        else payoff_raw
    ) if payoff_raw else []

    return {
        "strategy_id":   str(row["strategy_id"]),
        "strategy_name": row["strategy_name"],
        "underlying":    row["underlying"],
        "status":        row["status"],
        "net_premium":   float(row["net_premium"]) if row["net_premium"] else 0.0,
        "current_pnl":   round(total_pnl, 2),
        "created_at":    row["created_at"].isoformat(),
        "closed_at":     row["closed_at"].isoformat() if row["closed_at"] else None,
        "legs": [
            {
                "order_id":         str(o["order_id"]),
                "token":            o["token"],
                "symbol":           o["symbol"],
                "exch_seg":         o["exch_seg"],
                "transaction_type": o["transaction_type"],
                "order_type":       o["order_type"],
                "price":            float(o["price"]),
                "quantity":         o["quantity"],
                "status":           o["status"],
                "created_at":       o["created_at"].isoformat(),
            }
            for o in orders
        ],
        "positions":    pos_list,
        "payoff_graph": payoff,
    }
