import redis.asyncio as aioredis
from .config import get_settings

_redis: aioredis.Redis | None = None
_pubsub_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    global _redis, _pubsub_redis
    cfg = get_settings()
    kw: dict = dict(
        host=cfg.redis_host,
        port=cfg.redis_port,
        db=cfg.redis_db,
        decode_responses=True,
    )
    if cfg.redis_password:
        kw["password"] = cfg.redis_password
    _redis = aioredis.Redis(**kw)
    _pubsub_redis = aioredis.Redis(**kw)


async def close_redis() -> None:
    global _redis, _pubsub_redis
    if _redis:
        await _redis.aclose()
        _redis = None
    if _pubsub_redis:
        await _pubsub_redis.aclose()
        _pubsub_redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialised — call init_redis() first")
    return _redis


def get_pubsub_redis() -> aioredis.Redis:
    if _pubsub_redis is None:
        raise RuntimeError("Redis pub/sub client not initialised")
    return _pubsub_redis
