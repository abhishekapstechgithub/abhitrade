"""
Strategy API routes — /api/strategies/*
"""

from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import ORJSONResponse

from ...dependencies import CurrentUser, DBConn
from ...schemas.common import ApiResponse, paginate
from ...schemas.strategy import (
    CreateStrategyRequest,
    UpdateStrategyRequest,
    StrategyListParams,
    StrategyOut,
    StrategyLegOut,
    DeployResponseData,
    ImportBuilderRequest,
)
from ...services import strategy_service
from ...exceptions import NotFoundError

router = APIRouter(prefix="/strategies", tags=["strategies"])


def _build_strategy_out(row: dict) -> dict:
    """Convert a raw DB row dict to the camelCase output shape."""
    legs_raw = row.get("legs") or []
    legs = [
        {
            "id":         str(leg.get("id", "")),
            "action":     leg.get("action", "BUY"),
            "optionType": leg.get("optionType") or leg.get("option_type", "CE"),
            "strike":     leg.get("strike", 0),
            "expiry":     leg.get("expiry", ""),
            "lots":       leg.get("lots", 1),
            "premium":    leg.get("premium", 0),
            "iv":         leg.get("iv"),
            "delta":      leg.get("delta"),
            "theta":      leg.get("theta"),
        }
        for leg in legs_raw
    ]
    return {
        "id":            str(row["id"]),
        "name":          row["name"],
        "symbol":        row["symbol"],
        "exchange":      row["exchange"],
        "category":      row["category"],
        "status":        row["status"],
        "legs":          legs,
        "maxProfit":     row.get("max_profit"),
        "maxLoss":       row.get("max_loss"),
        "breakevenLow":  row.get("breakeven_low"),
        "breakevenHigh": row.get("breakeven_high"),
        "netPremium":    float(row.get("net_premium") or 0),
        "tags":          list(row.get("tags") or []),
        "notes":         row.get("notes"),
        "createdAt":     row["created_at"].isoformat() if row.get("created_at") else None,
        "updatedAt":     row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


# ── GET /strategies ────────────────────────────────────────────────────────────

@router.get("", response_class=ORJSONResponse)
async def list_strategies(
    user_id: CurrentUser,
    conn:    DBConn,
    page:      int = Query(1,  ge=1),
    pageSize:  int = Query(20, ge=1, le=100),
    category:  str = Query("all"),
    status:    str = Query("all"),
    symbol:    str = Query(""),
    exchange:  str = Query("all"),
    q:         str = Query(""),
    sortBy:    str = Query("createdAt"),
    order:     str = Query("desc"),
):
    params = StrategyListParams(
        page=page, page_size=pageSize,
        category=category, status=status,   # type: ignore[arg-type]
        symbol=symbol, exchange=exchange,   # type: ignore[arg-type]
        q=q, sort_by=sortBy, order=order,  # type: ignore[arg-type]
    )
    rows, total = await strategy_service.list_strategies(conn, user_id, params)
    return {
        "data": [_build_strategy_out(r) for r in rows],
        "meta": paginate(total, page, pageSize).model_dump(),
    }


# ── POST /strategies ───────────────────────────────────────────────────────────

@router.post("", response_class=ORJSONResponse, status_code=201)
async def create_strategy(
    body:    CreateStrategyRequest,
    user_id: CurrentUser,
    conn:    DBConn,
):
    row = await strategy_service.create_strategy(conn, user_id, body)
    return {"data": _build_strategy_out(row)}


# ── GET /strategies/tags ───────────────────────────────────────────────────────

@router.get("/tags", response_class=ORJSONResponse)
async def get_tags(user_id: CurrentUser, conn: DBConn):
    tags = await strategy_service.get_all_tags(conn, user_id)
    return {"data": tags}


# ── GET /strategies/{id} ───────────────────────────────────────────────────────

@router.get("/{strategy_id}", response_class=ORJSONResponse)
async def get_strategy(
    strategy_id: UUID,
    user_id:     CurrentUser,
    conn:        DBConn,
):
    row = await strategy_service.get_strategy(conn, strategy_id, user_id)
    return {"data": _build_strategy_out(row)}


# ── PATCH /strategies/{id} ─────────────────────────────────────────────────────

@router.patch("/{strategy_id}", response_class=ORJSONResponse)
async def update_strategy(
    strategy_id: UUID,
    body:        UpdateStrategyRequest,
    user_id:     CurrentUser,
    conn:        DBConn,
):
    row = await strategy_service.update_strategy(conn, strategy_id, user_id, body)
    return {"data": _build_strategy_out(row)}


# ── DELETE /strategies/{id} ────────────────────────────────────────────────────

@router.delete("/{strategy_id}", status_code=204)
async def delete_strategy(
    strategy_id: UUID,
    user_id:     CurrentUser,
    conn:        DBConn,
):
    await strategy_service.delete_strategy(conn, strategy_id, user_id)


# ── POST /strategies/{id}/clone ────────────────────────────────────────────────

@router.post("/{strategy_id}/clone", response_class=ORJSONResponse, status_code=201)
async def clone_strategy(
    strategy_id: UUID,
    user_id:     CurrentUser,
    conn:        DBConn,
    name: str | None = Query(None),
):
    row = await strategy_service.clone_strategy(conn, strategy_id, user_id, name)
    return {"data": _build_strategy_out(row)}


# ── POST /strategies/{id}/deploy ───────────────────────────────────────────────

@router.post("/{strategy_id}/deploy", response_class=ORJSONResponse)
async def deploy_strategy(
    strategy_id: UUID,
    user_id:     CurrentUser,
    conn:        DBConn,
):
    row, basket_id = await strategy_service.deploy_strategy(conn, strategy_id, user_id)
    deployed_at    = row.get("deployed_at") or datetime.now(timezone.utc)
    return {
        "data": {
            "strategy":   _build_strategy_out(row),
            "basketId":   basket_id,
            "deployedAt": deployed_at.isoformat() if hasattr(deployed_at, "isoformat") else deployed_at,
        }
    }


# ── POST /strategies/import ────────────────────────────────────────────────────

@router.post("/import", response_class=ORJSONResponse, status_code=201)
async def import_builder(
    body:    ImportBuilderRequest,
    user_id: CurrentUser,
    conn:    DBConn,
):
    """
    Convert a visual-builder JSON graph into a Strategy entity.
    If body.strategyId is set, overwrites that strategy.
    """
    bj = body.builder_json
    # Extract what we can from the builder JSON
    legs_raw = []
    for block in bj.get("blocks", []):
        if block.get("type") in ("option_leg",):
            sub = block.get("subtype", "long_ce")
            params = block.get("params", {})
            legs_raw.append({
                "id":         block.get("id", ""),
                "action":     "BUY" if sub.startswith("long") else "SELL",
                "optionType": "CE" if "ce" in sub else "PE",
                "strike":     float(params.get("strike", 0)),
                "expiry":     str(params.get("expiry", "")),
                "lots":       int(params.get("lots", 1)),
                "premium":    float(params.get("premium", 0)),
            })

    # Fallback: if no option_leg blocks, create a dummy leg
    if not legs_raw:
        legs_raw = [{
            "id": "auto-1", "action": "BUY", "optionType": "CE",
            "strike": 0.0, "expiry": "", "lots": 1, "premium": 0.0,
        }]

    from ...schemas.strategy import StrategyLegIn
    parsed_legs = [StrategyLegIn(**lg) for lg in legs_raw if lg.get("strike", 0) >= 0]
    if not parsed_legs:
        parsed_legs = [StrategyLegIn(
            action="BUY", optionType="CE",
            strike=20000, expiry="2025-12-31", lots=1, premium=0,
        )]

    create_req = CreateStrategyRequest(
        name=bj.get("name", "Untitled Strategy"),
        symbol=bj.get("symbol", "NIFTY"),
        exchange=bj.get("exchange", "NSE"),   # type: ignore[arg-type]
        category=bj.get("category", "neutral"),  # type: ignore[arg-type]
        legs=parsed_legs,
        netPremium=0.0,
        builderJson=bj,
    )

    if body.strategy_id:
        update_req = UpdateStrategyRequest(
            name=create_req.name,
            symbol=create_req.symbol,
            legs=create_req.legs,
            builderJson=bj,
        )
        row = await strategy_service.update_strategy(conn, body.strategy_id, user_id, update_req)
    else:
        row = await strategy_service.create_strategy(conn, user_id, create_req)

    return {"data": _build_strategy_out(row)}
