# TradeKaro — Complete API Documentation

**Base URL:** `http://localhost:80` (dev) · `https://abhitrade.online` (prod)  
**Auth:** Session cookie `at_sid` (set on login via OTP). All protected routes return `401` if missing.  
**Trading Mode:** Pass header `X-Trading-Mode: paper` to use paper trading DB. Default is `live`.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Option Chain](#2-option-chain)
3. [Market Data](#3-market-data)
4. [Search & Instruments](#4-search--instruments)
5. [Watchlists](#5-watchlists)
6. [Orders](#6-orders)
7. [Positions](#7-positions)
8. [Holdings](#8-holdings)
9. [Alerts](#9-alerts)
10. [Security Master Upload](#10-security-master-upload)
11. [Bhavcopy (EOD Prices)](#11-bhavcopy-eod-prices)
12. [AngelOne Integration](#12-angelone-integration)
13. [Error Reference](#13-error-reference)
14. [Redis Key Namespaces](#14-redis-key-namespaces)
15. [Strike Intervals](#15-strike-intervals-by-symbol)

---

## 1. Authentication

### `POST /api/auth/send-otp`
**Public.** Looks up user by name or email and sends a 6-digit OTP.

**Request**
```json
{ "email": "user@example.com" }
```
or
```json
{ "name": "Abhishek" }
```

**Response `200`**
```json
{ "ok": true, "userExists": true, "devOtp": "123456" }
```
> `devOtp` only appears in non-production mode.

**Response `200` — user not found**
```json
{ "ok": true, "userExists": false }
```

**Errors:** `400` missing input · `503` Redis offline

---

### `POST /api/auth/verify-otp`
**Public.** Verifies OTP and creates a session cookie `at_sid`.

**Request**
```json
{ "email": "user@example.com", "otp": "123456" }
```
or
```json
{ "name": "Abhishek", "otp": "123456" }
```

**Response `200`** — sets `at_sid` HttpOnly cookie
```json
{
  "ok": true,
  "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek", "phone": "9999999999" }
}
```

**Errors:** `400` invalid/expired OTP · `429` too many attempts · `404` user not found

---

### `POST /api/auth/login`
**Public.** Email + password login **or** registration in one endpoint.

**Login**
```json
{ "email": "user@example.com", "password": "secret" }
```

**Register**
```json
{ "email": "user@example.com", "password": "secret", "name": "Abhishek", "register": true }
```

**Response `200`** — sets `tk_refresh` HttpOnly cookie (7 days)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek", "kyc_status": "verified" }
}
```

**Errors:** `401` wrong credentials · `409` email already registered · `503` DB unavailable

---

### `GET /api/auth/me`
**Protected.** Returns current session user.

**Response `200`**
```json
{ "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek", "phone": "..." } }
```

---

### `POST /api/auth/logout`
**Protected.** Clears session cookie.

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /api/auth/refresh`
**Public.** Uses `tk_refresh` cookie to issue a new access token.

**Response `200`**
```json
{ "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
```

---

## 2. Option Chain

### `GET /api/optionchain/expiries`
**Public.** Returns all available expiry dates for a symbol.

**Query Parameters**
| Param | Required | Example |
|-------|----------|---------|
| `symbol` | ✅ | `NIFTY` |

**Response `200`**
```json
{
  "symbol": "NIFTY",
  "expiries": ["2026-06-18", "2026-06-25", "2026-08-27", "2026-09-24"],
  "nearest": "2026-06-18"
}
```

**Errors:** `400` missing symbol · `404` no expiries found

---

### `GET /api/optionchain`
**Public.** Full option chain with OI, IV, Greeks, PCR, and Max Pain.

**Query Parameters**
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `symbol` | ✅ | — | `NIFTY`, `BANKNIFTY`, `FINNIFTY`, `RELIANCE`, etc. |
| `expiry` | ✅ | — | `YYYY-MM-DD` format |
| `strikeCount` | ❌ | `15` | Number of strikes each side of ATM (max 50) |
| `fromStrike` | ❌ | — | Custom range start strike |
| `toStrike` | ❌ | — | Custom range end strike |

**Response `200`**
```json
{
  "symbol": "NIFTY",
  "expiry": "2026-06-18",
  "spot": 22456.80,
  "spotChange": 68.5,
  "spotChangePct": 0.31,
  "atm": 22450,
  "strikeInterval": 50,
  "rows": [
    {
      "strike": 22400,
      "isAtm": false,
      "isItm": true,
      "ce": {
        "token": 100029,
        "tradingSymbol": "NIFTY26JUN1822400CE",
        "ltp": 138.4,
        "open": 134.25,
        "high": 149.45,
        "low": 117.65,
        "close": 135.65,
        "oi": 174430,
        "changeOi": 7238,
        "volume": 13954,
        "bid": 138.1,
        "ask": 138.7,
        "bidQty": 118,
        "askQty": 161,
        "iv": 22.3,
        "delta": 0.534,
        "gamma": 0.0001,
        "theta": -2.14,
        "vega": 4.15,
        "rho": 0.053,
        "updatedAt": 1781435692180
      },
      "pe": {
        "token": 100030,
        "tradingSymbol": "NIFTY26JUN1822400PE",
        "ltp": 84.2,
        "oi": 150100,
        "changeOi": 3752,
        "volume": 12008,
        "bid": 84.05,
        "ask": 84.35,
        "iv": 19.3,
        "delta": -0.466
      }
    }
  ],
  "analytics": {
    "totalCallOI": 1150390,
    "totalPutOI": 1200080,
    "pcr": 1.043,
    "maxPain": 22450,
    "highestCEOI": 183090,
    "highestPEOI": 202780,
    "highestCEOIStrike": 22350,
    "highestPEOIStrike": 22500
  },
  "timestamp": "2026-06-14T11:14:52Z",
  "source": "mock",
  "_latencyMs": 13
}
```

**Response Headers**
| Header | Description |
|--------|-------------|
| `X-Option-Chain-Latency-Ms` | Server-side build time in ms |
| `X-Option-Chain-Source` | `live` or `mock` |
| `X-Option-Chain-Rows` | Number of strike rows returned |

**Errors:** `400` bad params · `404` no instruments · `503` spot price unavailable

---

### `GET /api/optionchain/stream`
**Public.** Server-Sent Events (SSE) stream. Full snapshot on connect, then diffs every 2 seconds.

**Query Parameters:** Same as `/api/optionchain` (`symbol`, `expiry`, `strikeCount`)

**Events**
| Event | Payload | When |
|-------|---------|------|
| `snapshot` | Full `OptionChainResponse` | On connect |
| `delta` | `{ changedRows, rows, spot, atm, analytics, timestamp }` | Every 2s when data changes |
| `error` | `{ message }` | On error |
| `: heartbeat` | _(comment line)_ | When no data changed |

**Client Example**
```js
const es = new EventSource(
  '/api/optionchain/stream?symbol=NIFTY&expiry=2026-06-18&strikeCount=15'
);
es.addEventListener('snapshot', e => {
  const chain = JSON.parse(e.data);
  console.log('Full chain:', chain.rows.length, 'strikes');
});
es.addEventListener('delta', e => {
  const diff = JSON.parse(e.data);
  console.log('Changed strikes:', diff.changedRows);
});
es.addEventListener('error', e => console.error(e));
// Close when done
es.close();
```

---

### `POST /api/optionchain/quote`
**Public.** Feed adapter — push live ticks from your market data source into the Redis quote cache.

**Push Live Quotes**
```json
{
  "type": "quotes",
  "ticks": [
    {
      "token": 100029,
      "ltp": 139.5,
      "oi": 175000,
      "changeOi": 570,
      "volume": 14100,
      "bid": 139.3,
      "ask": 139.7,
      "iv": 22.5,
      "delta": 0.537,
      "gamma": 0.0001,
      "theta": -2.1,
      "vega": 4.2
    }
  ]
}
```

**Push Spot Price**
```json
{
  "type": "spot",
  "spot": { "symbol": "NIFTY", "ltp": 22460.0, "change": 72.0, "changePct": 0.32 }
}
```

**Response `200`**
```json
{ "ok": true, "pushed": 1 }
```

---

### `GET /api/optionchain/quote?token=100029`
**Public.** Fetch cached quote for a single token from Redis.

**Response `200`**
```json
{
  "token": 100029,
  "tradingSymbol": "NIFTY26JUN1822400CE",
  "ltp": 138.4,
  "oi": 174430,
  "changeOi": 7238,
  "volume": 13954,
  "bid": 138.1,
  "ask": 138.7,
  "iv": 22.3,
  "delta": 0.534,
  "updatedAt": 1781435692180
}
```

**Error `404`** — no cached quote for this token

---

## 3. Market Data

### `GET /api/health`
**Public.** System health check for Redis and both Postgres databases.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2026-06-14T11:00:00Z",
  "services": {
    "api": "healthy",
    "redis": "connected",
    "postgres_live": "connected",
    "postgres_papertrade": "connected"
  }
}
```

**Response `503`** — when any service is down (`"status": "degraded"`)

---

### `GET /api/index-prices`
**Public.** Latest NIFTY / SENSEX / BANKNIFTY prices from Redis (auto-refreshed every 60s).

**Response `200`**
```json
{
  "prices": {
    "NIFTY":     { "ltp": 22456.80, "change": 68.5,   "changePct": 0.31 },
    "SENSEX":    { "ltp": 75527.95, "change": 1695.4,  "changePct": 2.30 },
    "BANKNIFTY": { "ltp": 48720.35, "change": -125.6,  "changePct": -0.26 }
  }
}
```

---

### `GET /api/market-movers`
**Public.** Top gainers or losers. Auto-syncs from Groww if data is older than 5 minutes.

**Query Parameters**
| Param | Values | Default |
|-------|--------|---------|
| `type` | `gainers` \| `losers` | `gainers` |
| `limit` | `1–50` | `50` |

**Response `200`**
```json
{
  "items": [
    {
      "symbol": "IFCI",
      "company_name": "IFCI Ltd",
      "ltp": 84.57,
      "change": 14.14,
      "change_pct": 19.99,
      "volume": 25000000,
      "is_gainer": true,
      "fetched_at": "2026-06-14T11:40:00Z"
    }
  ],
  "fetchedAt": "2026-06-14T11:40:00Z",
  "stale": false,
  "total": 50
}
```

### `POST /api/market-movers`
**Public.** Force-sync both gainers and losers from Groww immediately.

**Response `200`**
```json
{ "ok": true, "gainers": 50, "losers": 50 }
```

---

### `POST /api/market-data`
**Public (requires AngelOne env vars).** Fetch live quotes for one or more tokens from AngelOne.

**Request**
```json
{
  "tokens": [
    { "exchange": "NSE", "token": "3045",  "instrumentType": "EQ" },
    { "exchange": "NFO", "token": "58662", "instrumentType": "CE" }
  ],
  "mode": "FULL"
}
```

`mode` values: `LTP` | `OHLC` | `FULL`

**Response `200`**
```json
{
  "quotes": {
    "3045": {
      "token": "3045",
      "exchange": "NSE",
      "tradingSymbol": "RELIANCE-EQ",
      "ltp": 1293.0,
      "open": 1285.0,
      "high": 1298.5,
      "low": 1280.2,
      "close": 1287.6,
      "netChange": 5.4,
      "percentChange": 0.42,
      "volume": 3500000,
      "avgPrice": 1291.2,
      "oi": 0,
      "week52High": 1608.9,
      "week52Low": 1114.7,
      "bid": 1292.9,
      "ask": 1293.1,
      "upperCircuit": 1416.35,
      "lowerCircuit": 1158.85
    }
  },
  "unfetched": []
}
```

**Error `503`** — AngelOne credentials not configured in environment

---

### `GET /api/market-sync`
**Public.** Returns current market sync status.

**Response `200`**
```json
{
  "lastSync": "2026-06-14T11:05:00Z",
  "nextSync": "2026-06-14T11:06:00Z",
  "status": "ok",
  "symbols": 6,
  "latencyMs": 312
}
```

### `POST /api/market-sync`
**Public.** Triggers an immediate manual market data sync.

**Response `200`**
```json
{ "status": "ok", "synced": 6, "latencyMs": 298 }
```

### `GET /api/market-sync/data`
**Public.** Returns all cached quotes as a flat symbol map.

**Response `200`**
```json
{
  "NIFTY":  { "ltp": 22456.80, "change": 68.5 },
  "SENSEX": { "ltp": 75527.95, "change": 1695.4 }
}
```

---

## 4. Search & Instruments

### `GET /api/search`
**Public.** Search instruments. Queries Redis cache first, then Postgres full-text search.

**Query Parameters**
| Param | Default | Description |
|-------|---------|-------------|
| `q` | — | Search term (min 1 character) |
| `exchange` | `all` | `NSE` \| `BSE` \| `all` |
| `type` | `all` | `EQ` \| `FUT` \| `OPT` \| `all` |
| `limit` | `20` | Max results (max 50) |

**Response `200`**
```json
{
  "results": [
    {
      "token": "3045",
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "tradingSymbol": "RELIANCE-EQ",
      "name": "Reliance Industries Ltd",
      "instrumentType": "EQ",
      "segment": "NSE_EQ",
      "lotSize": 1,
      "ltp": 1293.0,
      "prevClose": 1287.6,
      "netChange": 5.4,
      "changePct": 0.42,
      "volume": 3500000,
      "priceDate": "2026-06-14"
    }
  ],
  "total": 1,
  "source": "postgres"
}
```

`source` values: `redis-cache` | `postgres` | `empty`

---

### `GET /api/instruments/:token`
**Public.** Fetch a single instrument by token. Checks Redis first, falls back to Postgres.

**Query Parameters**
| Param | Default | Description |
|-------|---------|-------------|
| `exchange` | `NSE` | Exchange to scope the lookup |

**Response `200`**
```json
{
  "instrument": {
    "token": "3045",
    "exchange": "NSE",
    "symbol": "RELIANCE",
    "tradingSymbol": "RELIANCE-EQ",
    "instrumentType": "EQ",
    "lotSize": 1,
    "tickSize": 0.05,
    "isin": "INE002A01018"
  },
  "source": "redis"
}
```

---

### `GET /api/scrips`
**Public.** Bulk scrip lookup from Redis security master.

**Query Parameters**
| Param | Default | Description |
|-------|---------|-------------|
| `symbols` | — | Comma-separated: `RELIANCE,TCS,INFY` |
| `exchange` | `NSE` | `NSE` \| `BSE` |
| `type` | `EQ` | `EQ` \| `FUT` \| `CE` \| `PE` \| `all` |

**Response `200`**
```json
{
  "scrips": [
    {
      "token": "3045",
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "tradingSymbol": "RELIANCE-EQ",
      "instrumentType": "EQ",
      "lotSize": 1,
      "tickSize": 0.05,
      "isin": "INE002A01018",
      "expiry": "",
      "strike": null,
      "optionType": ""
    }
  ],
  "found": 1,
  "missing": []
}
```

---

## 5. Watchlists

> All watchlist endpoints require authentication (`at_sid` cookie).  
> Pass `X-Trading-Mode: paper` header to use paper trading DB.

### `GET /api/watchlists`
Returns all watchlists for the authenticated user.

**Response `200`**
```json
{
  "watchlists": [
    { "id": "uuid", "name": "My Watchlist", "sort_order": 0, "created_at": "2026-06-01T10:00:00Z" },
    { "id": "uuid", "name": "F&O Watchlist", "sort_order": 1, "created_at": "2026-06-02T10:00:00Z" }
  ],
  "mode": "live"
}
```

### `POST /api/watchlists`
Create a new watchlist.

**Request**
```json
{ "name": "Options Watchlist" }
```

**Response `201`**
```json
{ "watchlist": { "id": "uuid", "name": "Options Watchlist", "sort_order": 2 }, "mode": "live" }
```

---

### `PATCH /api/watchlists/:id`
Rename or reorder a watchlist.

**Request**
```json
{ "name": "My F&O List", "sort_order": 0 }
```

**Response `200`**
```json
{ "watchlist": { "id": "uuid", "name": "My F&O List", "sort_order": 0 } }
```

### `DELETE /api/watchlists/:id`
**Response `200`:** `{ "ok": true }`

---

### `GET /api/watchlists/:id/items`
Get all symbols in a watchlist.

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "watchlist_id": "uuid",
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "token": "3045",
      "sort_order": 0
    }
  ]
}
```

### `POST /api/watchlists/:id/items`
Add a symbol to a watchlist.

**Request**
```json
{ "symbol": "RELIANCE", "exchange": "NSE", "token": "3045" }
```

**Response `201`**
```json
{ "item": { "id": "uuid", "symbol": "RELIANCE", "exchange": "NSE", "token": "3045" } }
```

**Error `409`** — Symbol already in watchlist

### `DELETE /api/watchlists/:id/items/:itemId`
Remove a symbol from a watchlist.

**Response `200`:** `{ "ok": true }`

---

## 6. Orders

> All order endpoints require authentication. Use `X-Trading-Mode: paper` for paper trading.

### `GET /api/orders`
Fetch orders for the authenticated user.

**Query Parameters**
| Param | Description |
|-------|-------------|
| `status` | `OPEN` \| `COMPLETE` \| `CANCELLED` \| `REJECTED` |
| `limit` | Default `50`, max `200` |
| `offset` | Pagination offset |

**Response `200`**
```json
{
  "orders": [
    {
      "id": "uuid",
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "transaction_type": "BUY",
      "order_type": "LIMIT",
      "product_type": "DELIVERY",
      "quantity": 10,
      "price": 1290.0,
      "trigger_price": null,
      "status": "OPEN",
      "filled_quantity": 0,
      "pending_quantity": 10,
      "average_price": null,
      "placed_at": "2026-06-14T10:00:00Z",
      "tag": null
    }
  ],
  "mode": "live"
}
```

### `POST /api/orders`
Place a new order.

**Request**
```json
{
  "exchange": "NSE",
  "symbol": "RELIANCE",
  "transaction_type": "BUY",
  "order_type": "LIMIT",
  "product_type": "DELIVERY",
  "quantity": 10,
  "price": 1290.0,
  "trigger_price": null,
  "tag": "swing-trade"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `exchange` | ✅ | `NSE` \| `BSE` \| `NFO` \| `BFO` |
| `symbol` | ✅ | e.g. `RELIANCE`, `NIFTY26JUN22450CE` |
| `transaction_type` | ✅ | `BUY` \| `SELL` |
| `order_type` | ✅ | `MARKET` \| `LIMIT` \| `SL` \| `SL-M` |
| `product_type` | ✅ | `DELIVERY` \| `INTRADAY` \| `CARRYFORWARD` |
| `quantity` | ✅ | Positive integer |
| `price` | ❌ | Required for `LIMIT` and `SL` |
| `trigger_price` | ❌ | Required for `SL` and `SL-M` |

**Response `201`**
```json
{ "order": { "id": "uuid", "status": "OPEN", ... }, "mode": "live" }
```

### `PATCH /api/orders/:id`
Modify price or quantity of an open order.

**Request**
```json
{ "price": 1295.0, "quantity": 5 }
```

**Response `200`:** `{ "order": { ... } }`  
**Error `404`** — not found or order is already in a terminal state

### `DELETE /api/orders/:id`
Cancel an open order.

**Response `200`**
```json
{ "order": { "id": "uuid", "status": "CANCELLED", ... } }
```

---

## 7. Positions

### `GET /api/positions`
**Protected.** Fetch open and closed positions.

**Query Parameters**
| Param | Description |
|-------|-------------|
| `date` | `YYYY-MM-DD` — filter positions by date |

**Response `200`**
```json
{
  "positions": [
    {
      "id": "uuid",
      "symbol": "NIFTY26JUN22450CE",
      "exchange": "NFO",
      "product_type": "CARRYFORWARD",
      "quantity": 75,
      "average_price": 102.85,
      "ltp": 110.50,
      "pnl": 577.50,
      "pnl_pct": 7.43,
      "realized_pnl": 0,
      "unrealized_pnl": 577.50,
      "is_paper": false
    }
  ],
  "mode": "live"
}
```

---

## 8. Holdings

### `GET /api/holdings`
**Protected.** Fetch long-term holdings.

**Response `200`**
```json
{
  "holdings": [
    {
      "id": "uuid",
      "symbol": "RELIANCE",
      "exchange": "NSE",
      "quantity": 10,
      "average_price": 1285.0,
      "current_price": 1293.0,
      "current_value": 12930.0,
      "invested_value": 12850.0,
      "pnl": 80.0,
      "pnl_pct": 0.62,
      "isin": "INE002A01018"
    }
  ],
  "mode": "live"
}
```

---

## 9. Alerts

### `GET /api/alerts`
**Protected.**

**Query Parameters**
| Param | Values |
|-------|--------|
| `status` | `active` \| `triggered` \| `expired` |

**Response `200`**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "exchange": "NSE",
      "symbol": "RELIANCE",
      "condition": "ABOVE",
      "target_value": 1300.0,
      "current_value": 1293.0,
      "status": "active",
      "note": "ATH breakout watch",
      "created_at": "2026-06-14T09:00:00Z"
    }
  ],
  "mode": "live"
}
```

### `POST /api/alerts`
**Request**
```json
{
  "exchange": "NSE",
  "symbol": "RELIANCE",
  "condition": "ABOVE",
  "target_value": 1300.0,
  "note": "ATH breakout"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `exchange` | ✅ | `NSE` \| `BSE` \| `NFO` |
| `symbol` | ✅ | e.g. `RELIANCE` |
| `condition` | ✅ | `ABOVE` \| `BELOW` \| `PERCENT_CHANGE` \| `OI_ABOVE` \| `OI_BELOW` \| `VOLUME_SPIKE` |
| `target_value` | ✅ | Numeric threshold |
| `note` | ❌ | Optional label |

**Response `201`:** `{ "alert": { ... }, "mode": "live" }`

### `PATCH /api/alerts/:id`
**Request:** `{ "target_value": 1310.0, "status": "active" }`  
**Response `200`:** `{ "alert": { ... } }`

### `DELETE /api/alerts/:id`
**Response `200`:** `{ "ok": true }`

---

## 10. Security Master Upload

### `POST /api/upload`
**Public.** Upload NSE/BSE security master CSV. Saves to disk and processes in background.

**Request** — `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | ✅ | `.csv` or `.txt`, max 200 MB |
| `fileType` | string | ✅ | `NSE_CM` \| `BSE_CM` \| `NSE_FO` \| `BSE_FO` |
| `overwrite` | string | ❌ | `"true"` to overwrite existing records |

**Response `200`**
```json
{ "jobId": "550e8400-e29b-41d4-a716-446655440000", "status": "queued", "message": "Upload queued" }
```

**Errors:** `400` no file or bad type · `503` Redis unavailable

---

### `GET /api/upload?jobId=uuid`
Poll the status of an upload job.

**Response `200`**
```json
{
  "jobId": "uuid",
  "status": "processing",
  "filename": "NSE_FO_20260614.csv",
  "fileType": "NSE_FO",
  "progress": "65"
}
```

`status` values: `queued` | `processing` | `done` | `error`

---

### `GET /api/upload/status/:jobId`
Detailed upload job status with row-level stats.

**Response `200`**
```json
{
  "jobId": "uuid",
  "status": "done",
  "progress": 100,
  "filename": "NSE_FO_20260614.csv",
  "format": "NSE_FO",
  "exchange": "NSE",
  "totalRows": 240000,
  "valid": 239847,
  "invalid": 153,
  "loaded": 239847,
  "durationMs": 4200,
  "completedAt": "2026-06-14T11:05:04Z",
  "createdAt": "2026-06-14T11:05:00Z"
}
```

---

### `GET /api/redis-stats`
**Public.** Redis memory usage and key counts.

**Response `200`**
```json
{
  "connected": true,
  "memoryUsed": "48.2 MB",
  "totalKeys": 51204,
  "instrumentKeys": 48920,
  "jobKeys": 12
}
```

### `DELETE /api/redis-clear`
**Public.** Clears all `at:*` namespace keys (security master cache only).

**Response `200`**
```json
{ "ok": true, "deleted": 48920 }
```

### `GET /api/debug-redis`
**Public.** Redis connection diagnostics and ping latency.

---

## 11. Bhavcopy (EOD Prices)

### `POST /api/bhavcopy/upload`
Upload NSE/BSE end-of-day bhavcopy CSV to update EOD prices in `security_master`.

**Request** — `multipart/form-data`
| Field | Required | Description |
|-------|----------|-------------|
| `file` | ✅ | Bhavcopy `.csv` file |
| `exchange` | ✅ | `NSE` \| `BSE` |

**Response `200`**
```json
{ "jobId": "uuid", "status": "queued" }
```

### `GET /api/bhavcopy`
Returns bhavcopy load history and latest run status.

---

### `POST /api/index-bhavcopy/upload`
Upload index bhavcopy (daily OHLCV for NIFTY, SENSEX, BANKNIFTY, etc.).

**Request** — `multipart/form-data`: `file` (.csv)

**Response `200`:** `{ "jobId": "uuid", "status": "queued" }`

### `GET /api/index-bhavcopy`
Returns index bhavcopy load status.

---

## 12. AngelOne Integration

> These routes proxy directly to AngelOne's Smart API.  
> The client must first call `/api/angel-one/connect` to obtain `accessToken` and `apiKey`, then pass them in the body of subsequent requests.

### `POST /api/angel-one/connect`
Login to AngelOne with TOTP auto-generation (no external library required).  
Automatically retries across 3 TOTP time windows to handle clock drift.

**Request**
```json
{
  "apiKey": "your-api-key",
  "clientId": "YOUR_CLIENT_ID",
  "clientPassword": "your-login-password",
  "totpSecret": "BASE32_TOTP_SECRET"
}
```

**Response `200`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "feedToken": "abc123feedtoken",
  "refreshToken": "refresh_token_value",
  "profile": { "name": "Abhishek", "email": "user@example.com" }
}
```

**Error `401`** — wrong credentials · `400` missing fields

---

### `POST /api/angel-one/quotes`
Fetch live market quotes (LTP / OHLC / Full depth).

**Request**
```json
{
  "apiKey": "your-api-key",
  "accessToken": "eyJ...",
  "mode": "FULL",
  "exchangeTokens": {
    "NSE": ["3045", "1594"],
    "NFO": ["58662"]
  }
}
```

`mode`: `LTP` | `OHLC` | `FULL`

**Response `200`** — AngelOne raw quote response

---

### `POST /api/angel-one/candles`
Fetch historical OHLCV candle data.

**Request**
```json
{
  "apiKey": "your-api-key",
  "accessToken": "eyJ...",
  "exchange": "NSE",
  "symboltoken": "3045",
  "timeframe": "1D"
}
```

`timeframe` values: `1m` | `5m` | `15m` | `30m` | `1h` | `1D` | `1W`

**Response `200`**
```json
{
  "candles": [
    ["2026-06-14T09:15:00+05:30", 1285.0, 1298.5, 1280.2, 1293.0, 3500000]
  ],
  "interval": "ONE_DAY",
  "from": "2025-06-14T00:00:00",
  "to": "2026-06-14T00:00:00"
}
```

Each candle array: `[timestamp, open, high, low, close, volume]`

---

### `POST /api/angel-one/place-order`
Place an order on AngelOne.

**Request**
```json
{
  "apiKey": "your-api-key",
  "accessToken": "eyJ...",
  "order": {
    "exchange": "NSE",
    "tradingsymbol": "RELIANCE-EQ",
    "symboltoken": "3045",
    "transactiontype": "BUY",
    "ordertype": "LIMIT",
    "producttype": "DELIVERY",
    "duration": "DAY",
    "price": "1290",
    "quantity": "10"
  }
}
```

**Response `200`**
```json
{ "orderId": "220614000123456", "message": "SUCCESS" }
```

---

### `POST /api/angel-one/ltp`
Fetch Last Traded Price for a single symbol.

**Request**
```json
{
  "apiKey": "...", "accessToken": "...",
  "exchange": "NSE", "symbol": "RELIANCE", "token": "3045"
}
```

**Response `200`:** `{ "ltp": 1293.0 }`

---

### `POST /api/angel-one/orderbook`
Fetch live order book and trade book from AngelOne.

**Request:** `{ "apiKey": "...", "accessToken": "..." }`

---

### `POST /api/angel-one/portfolio`
Fetch live holdings and RMS (risk management system) data from AngelOne.

**Request:** `{ "apiKey": "...", "accessToken": "..." }`

---

### `POST /api/angel-one/positions`
Fetch live open positions from AngelOne.

**Request:** `{ "apiKey": "...", "accessToken": "..." }`

---

### `POST /api/angel-one/profile`
Fetch AngelOne user profile and RMS limits.

**Request:** `{ "apiKey": "...", "accessToken": "..." }`

---

### `POST /api/angel-one/margin`
Calculate margin required for a potential order.

**Request:** `{ "apiKey": "...", "accessToken": "...", "order": { ... } }`

---

### `POST /api/angel-one/search`
Search instruments on AngelOne (NSE/BSE scrip master).

**Request:** `{ "apiKey": "...", "accessToken": "...", "query": "RELIANCE", "exchange": "NSE" }`

---

### `GET /api/ws-credentials`
**Public (requires AngelOne env vars).** Returns short-lived WebSocket feed credentials for browser-side live tick subscriptions.

**Response `200`**
```json
{
  "feedToken": "abc123feedtoken",
  "clientCode": "YOUR_CLIENT_ID",
  "apiKey": "your-api-key"
}
```

Use these to connect to AngelOne's SmartAPI WebSocket (`wss://smartapisocket.angelone.in/smart-stream`) for live market ticks.

**Error `503`** — AngelOne credentials not configured in `.env.local`

---

## 13. Error Reference

| HTTP Code | Meaning |
|-----------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No content |
| `400` | Validation error — check request body/params |
| `401` | Not authenticated — session missing or expired |
| `404` | Resource not found |
| `409` | Conflict — duplicate resource (e.g. symbol already in watchlist) |
| `429` | Rate limited — OTP too many attempts |
| `500` | Internal server error |
| `502` | Bad gateway — broker API returned unexpected response |
| `503` | Dependency unavailable (Redis / Postgres / AngelOne credentials) |

**Standard error response shape:**
```json
{ "error": "Human-readable error message" }
```

---

## 14. Redis Key Namespaces

| Key Pattern | TTL | Contents |
|-------------|-----|----------|
| `at:instr:{exchange}:{token}` | — | Instrument hash (full security master record) |
| `at:sym:{exchange}:{SYMBOL}` | — | Set of tokens matching a symbol |
| `at:auto` | — | Sorted set for autocomplete prefix search |
| `at:job:{jobId}` | 24h | Upload job tracking hash |
| `at:count:{exchange}` | — | Total loaded count per exchange |
| `oc:q:{token}` | 60s | Live option quote JSON |
| `oc:spot:{SYMBOL}` | 30s | Spot price JSON `{ ltp, change, changePct }` |
| `oc:chain:{SYMBOL}:{expiry}` | 5s | Cached full option chain JSON |
| `tk:q:{exchange}:{type}:{query}` | 5m | Search result cache |

---

## 15. Strike Intervals by Symbol

| Symbol | Interval |
|--------|----------|
| NIFTY | 50 |
| BANKNIFTY | 100 |
| FINNIFTY | 50 |
| MIDCPNIFTY | 25 |
| SENSEX | 100 |
| BANKEX | 100 |
| RELIANCE | 50 |
| TCS | 50 |
| INFY | 50 |
| HDFCBANK | 50 |
| SBIN | 10 |
| Other stocks | 50 (default) |

---

## Environment Variables Required

```env
# App
JWT_SECRET=your-jwt-secret
COOKIE_SECURE=true              # Set true in production (HTTPS only)
UPLOAD_DIR=/tmp/tradekaro-uploads

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=tradekaro
POSTGRES_PASSWORD=
POSTGRES_DB_LIVE=abhitrade_live
POSTGRES_DB_PAPER=abhitrade_papertrade

# AngelOne (optional — required for live market data)
ANGELONE_API_KEY=
ANGELONE_CLIENT_ID=
ANGELONE_PASSWORD=
ANGELONE_TOTP_SECRET=

# Public
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```
