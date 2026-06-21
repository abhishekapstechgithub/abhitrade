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

            # Normalize tick for Flutter clients:
            #   ws-live.ts publishes {ltp, open, high, low, close, volume}
            #   Flutter _onTick filters on mode=='full' and reads last_price/open_price/etc.
            ltp   = tick.get("ltp", 0) or 0
            close = tick.get("close", 0) or 0
            net   = round(ltp - close, 2)
            pct   = round((net / close * 100), 4) if close else 0
            normalized = {
                **tick,
                "mode":           "full",
                "last_price":     ltp,
                "open_price":     tick.get("open", 0),
                "high_price":     tick.get("high", 0),
                "low_price":      tick.get("low", 0),
                "close_price":    close,
                "net_change":     net,
                "percent_change": pct,
            }

            try:
                await websocket.send_json(normalized)
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
