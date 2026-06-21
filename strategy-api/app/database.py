"""
asyncpg connection pool — shared across the app lifetime.

Usage in route handlers:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT ...")
"""

import asyncpg
from typing import Optional
from .config import get_settings

_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    global _pool
    cfg = get_settings()
    _pool = await asyncpg.create_pool(
        dsn=cfg.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
        # Return dicts instead of Record objects for easier JSON serialisation
        init=_set_codec,
    )


async def _set_codec(conn: asyncpg.Connection) -> None:
    """Register JSON/JSONB codec so asyncpg auto-parses JSONB columns."""
    await conn.set_type_codec(
        "jsonb",
        encoder=lambda v: v,
        decoder=lambda v: v,
        schema="pg_catalog",
        format="text",
    )
    await conn.set_type_codec(
        "json",
        encoder=lambda v: v,
        decoder=lambda v: v,
        schema="pg_catalog",
        format="text",
    )


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialised — call init_pool() first")
    return _pool
