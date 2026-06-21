"""
TradeKaro Strategy + Paper Trading API — FastAPI application entrypoint.

Traffic path (production):
  Nginx → /api/strategies/*       → strategy-api:8000
          /api/backtests/*        → strategy-api:8000
          /api/paper/*            → strategy-api:8000
          /api/scrip/*            → strategy-api:8000
          /ws/stream              → strategy-api:8000
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from .config import get_settings
from .database import init_pool, close_pool
from .redis_client import init_redis, close_redis
from .exceptions import AppError, app_error_handler, validation_error_handler
from .api.v1.router import v1_router
from .workers.limit_engine import run_limit_engine
from .workers.scrip_sync import run_daily_scrip_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting strategy-api — initialising DB pool + Redis")
    await init_pool()
    await init_redis()
    log.info("DB pool + Redis ready")

    # Background workers (fire-and-forget — exceptions are logged, not fatal)
    limit_task = asyncio.create_task(run_limit_engine(),   name="limit-engine")
    scrip_task = asyncio.create_task(run_daily_scrip_sync(), name="scrip-sync")
    log.info("Background workers started: limit-engine, scrip-sync")

    yield

    log.info("Shutting down — cancelling workers and closing connections")
    limit_task.cancel()
    scrip_task.cancel()
    await asyncio.gather(limit_task, scrip_task, return_exceptions=True)
    await close_pool()
    await close_redis()
    log.info("Shutdown complete")


settings = get_settings()

app = FastAPI(
    title="TradeKaro Strategy + Paper Trading API",
    version="2.0.0",
    description="REST + WebSocket API for strategy management, backtesting, and paper trading",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────

app.add_exception_handler(AppError, app_error_handler)                       # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> ORJSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url)
    return ORJSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )

# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(v1_router, prefix="/api")


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": "strategy-api", "version": "2.0.0"}
