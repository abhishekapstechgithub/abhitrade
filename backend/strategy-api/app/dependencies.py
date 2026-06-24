"""
FastAPI dependency functions — injected into route handlers via Depends().
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from jose import JWTError, jwt

from .config import Settings, get_settings
from .database import get_pool
from .exceptions import UnauthorizedError
import asyncpg


# ── Database connection ───────────────────────────────────────────────────────

async def get_conn() -> asyncpg.Connection:
    """Yields a single connection from the pool for one request."""
    async with get_pool().acquire() as conn:
        yield conn


DBConn = Annotated[asyncpg.Connection, Depends(get_conn)]


# ── Auth ──────────────────────────────────────────────────────────────────────

async def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> UUID:
    """
    Validates the Bearer JWT token sent by the Next.js frontend.
    Returns the user UUID.  Raises 401 if invalid or missing.

    Set AUTH_ENABLED=false in .env to bypass during local dev.
    """
    if not settings.auth_enabled:
        # Dev bypass — return a fixed UUID so repositories still work
        return UUID("00000000-0000-0000-0000-000000000001")

    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Bearer token required")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise UnauthorizedError(f"Invalid token: {exc}") from exc

    user_id_str: str | None = payload.get("sub") or payload.get("userId")
    if not user_id_str:
        raise UnauthorizedError("Token missing subject claim")

    try:
        return UUID(user_id_str)
    except ValueError:
        raise UnauthorizedError("Token subject is not a valid UUID")


CurrentUser = Annotated[UUID, Depends(get_current_user_id)]
