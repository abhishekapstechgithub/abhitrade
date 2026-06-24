"""
Strategy service — business logic between the HTTP layer and the repository.

Responsibilities:
  - Ownership enforcement (user can only touch their own strategies)
  - Derived field computation (net premium, analytics)
  - Clone / deploy orchestration
"""

from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg

from ..repositories import strategy_repo
from ..schemas.strategy import (
    CreateStrategyRequest,
    UpdateStrategyRequest,
    StrategyListParams,
)
from ..exceptions import NotFoundError, ForbiddenError


async def list_strategies(
    conn: asyncpg.Connection,
    user_id: UUID,
    params: StrategyListParams,
) -> tuple[list[dict], int]:
    total = await strategy_repo.count(conn, user_id, params)
    rows  = await strategy_repo.list_strategies(conn, user_id, params)
    return rows, total


async def get_strategy(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
) -> dict:
    row = await strategy_repo.get_by_id(conn, strategy_id, user_id)
    if not row:
        raise NotFoundError("Strategy")
    return row


async def create_strategy(
    conn: asyncpg.Connection,
    user_id: UUID,
    data: CreateStrategyRequest,
) -> dict:
    return await strategy_repo.create(conn, user_id, data)


async def update_strategy(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
    data: UpdateStrategyRequest,
) -> dict:
    # Verify ownership first
    existing = await strategy_repo.get_by_id(conn, strategy_id, user_id)
    if not existing:
        raise NotFoundError("Strategy")

    row = await strategy_repo.update(conn, strategy_id, user_id, data)
    if not row:
        raise NotFoundError("Strategy")
    return row


async def delete_strategy(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
) -> None:
    existing = await strategy_repo.get_by_id(conn, strategy_id, user_id)
    if not existing:
        raise NotFoundError("Strategy")

    deleted = await strategy_repo.delete(conn, strategy_id, user_id)
    if not deleted:
        raise NotFoundError("Strategy")


async def clone_strategy(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
    name_override: str | None = None,
) -> dict:
    original = await strategy_repo.get_by_id(conn, strategy_id, user_id)
    if not original:
        raise NotFoundError("Strategy")

    clone_data = CreateStrategyRequest(
        name=name_override or f"{original['name']} (copy)",
        symbol=original["symbol"],
        exchange=original["exchange"],
        category=original["category"],
        status="saved",
        legs=original["legs"],
        maxProfit=original["max_profit"],
        maxLoss=original["max_loss"],
        breakevenLow=original["breakeven_low"],
        breakevenHigh=original["breakeven_high"],
        netPremium=original["net_premium"],
        tags=original.get("tags") or [],
        notes=original.get("notes"),
        builderJson=original.get("builder_json"),
    )
    return await strategy_repo.create(conn, user_id, clone_data)


async def deploy_strategy(
    conn: asyncpg.Connection,
    strategy_id: UUID,
    user_id: UUID,
    basket_name: str | None = None,
) -> dict:
    existing = await strategy_repo.get_by_id(conn, strategy_id, user_id)
    if not existing:
        raise NotFoundError("Strategy")

    # Generate a basket ID (would be the broker's basket ID in production)
    basket_id = f"BKT-{uuid4().hex[:8].upper()}"
    row = await strategy_repo.mark_deployed(conn, strategy_id, user_id, basket_id)
    if not row:
        raise NotFoundError("Strategy")
    return row, basket_id


async def get_all_tags(
    conn: asyncpg.Connection,
    user_id: UUID,
) -> list[str]:
    return await strategy_repo.get_all_tags(conn, user_id)
