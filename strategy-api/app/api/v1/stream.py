"""
WebSocket streaming endpoint.
Subscribes to Redis pub/sub channel market:ticks (published by ws-live.ts)
and forwards filtered ticks to the connected frontend client.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ...redis_client import get_pubsub_redis

log    = logging.getLogger(__name__)
router = APIRouter(tags=["stream"])


@router.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    await websocket.accept()

    # First message: client sends list of tokens to watch
    subscribed: set[str] = set()
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        data = json.loads(raw)
        if isinstance(data, list):
            subscribed = {str(t) for t in data if t}
        elif isinstance(data, dict) and "tokens" in data:
            subscribed = {str(t) for t in data["tokens"] if t}
    except (asyncio.TimeoutError, Exception):
        pass  # no filter — broadcast everything

    log.info("[ws-stream] client connected, watching %d tokens", len(subscribed))

    r      = get_pubsub_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("market:ticks")

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                tick = json.loads(message["data"])
            except Exception:
                continue

            if subscribed and tick.get("token") not in subscribed:
                continue

            try:
                await websocket.send_json(tick)
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.warning("[ws-stream] error: %s", e)
    finally:
        await pubsub.unsubscribe("market:ticks")
        await pubsub.aclose()
        log.info("[ws-stream] client disconnected")
