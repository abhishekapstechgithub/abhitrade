# AbhiTrade — Paper Trading, Options & Strategy API Documentation

**Service:** `strategy-api` (FastAPI / Python — `uvicorn` async)  
**Base URL (local dev via Nginx):** `http://localhost` ← always use this; port 8000 is internal-only  
**Base URL (production via Nginx):** `https://abhitrade.online`  
**Auth:** Bearer JWT — issued by Next.js `POST /api/auth/verify-otp` or `GET /api/auth/me/token`  
**API Docs (Swagger):** `http://localhost:8000/docs` ← only from inside Docker network

---

## Architecture Overview

```
Angel One SmartStream (WebSocket)
        │
        ▼
ws-live.ts  (Next.js server — connects once, broadcasts to all clients)
  ├─ Redis SET  at:market:ltp:token:{token}         ← LTP by token (paper engine)
  ├─ Redis SET  at:market:quote:{exchange}:{symbol}  ← full OHLCV JSON
  ├─ Redis SET  at:live:tick:{exchangeType}:{token}  ← raw tick JSON
  └─ Redis PUB  market:ticks channel                ← pub/sub broadcast
        │
        ▼
strategy-api  (FastAPI Python — reads Redis, writes PostgreSQL)
  ├─ Paper order engine          ACID transactions in PostgreSQL
  ├─ Limit order engine          polls Redis LTP every 2 s
  ├─ Multi-leg strategy basket   atomic multi-order execution
  ├─ Option Greeks               Angel One SmartAPI → Redis (5 min TTL) → Postgres
  ├─ Active token registry       Redis HINCRBY active_tokens_registry
  ├─ Daily scrip sync            Angel One CDN JSON → angle_scrip table (08:30 IST)
  └─ WebSocket stream            Redis market:ticks → connected frontend clients
```

**Tech choices:**
- **FastAPI + asyncpg** — fastest Python async Postgres driver (binary protocol)  
- **redis.asyncio** — fully async, handles pub/sub + pipeline in the same event loop  
- **Angel One SmartStream mode 3 (SnapQuote)** — gives LTP + Open + High + Low + Close + Volume per tick  

---

## Authentication

All strategy-api endpoints except `/health` require:
```
Authorization: Bearer <jwt_token>
```

### Token Flow

JWT tokens are issued by **Next.js** (not strategy-api) and share the same `JWT_SECRET`.

| Situation | How to get a token |
|---|---|
| First login | `POST /api/auth/verify-otp` → response includes `accessToken` |
| Already logged in (session cookie exists) | `GET /api/auth/me/token` → issues a fresh JWT from the existing session |
| App startup (auto) | `TokenAutoFetch` client component fetches `/api/auth/me/token` if `tk_access_token` is missing in localStorage |

**Token storage:** Stored in `localStorage` as `tk_access_token` after login. All frontend API calls read from there via `authHeaders()`.

**Set `AUTH_ENABLED=false`** in strategy-api `.env` to disable auth checks for local dev/testing.

### Next.js Middleware Bypass

The Next.js edge middleware (`middleware.ts`) allows strategy-api paths through without a session cookie check — strategy-api handles its own Bearer token auth:
```
/api/paper, /api/scrip, /api/strategies, /api/options, /api/tokens, /api/backtests
```
All other `/api/*` paths require an `at_sid` session cookie (Next.js routes).

---

## Database Schema (PostgreSQL — `abhitrade_live`)

### `angle_scrip` — Instrument master (auto-synced daily at 08:30 IST)
| Column | Type | Notes |
|---|---|---|
| `token` | TEXT PK | Angel One instrument token |
| `symbol` | TEXT | Trading symbol (e.g. `RELIANCE-EQ`) |
| `name` | TEXT | Full company/instrument name |
| `expiry` | DATE | Options/futures expiry |
| `strike` | NUMERIC | Strike price (options) |
| `lotsize` | INT | Contract lot size |
| `instrumenttype` | TEXT | `EQ`, `OPTIDX`, `FUTIDX`, `OPTSTK`, `FUTSTK` |
| `exch_seg` | TEXT | `NSE`, `BSE`, `NFO`, `BFO`, `MCX` |
| `ltp` / `open` / `high` / `low` / `close` | NUMERIC | Updated by ws-live.ts every 3 s |

### `option_greeks_cache` — Greeks snapshot from Angel One API
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `underlying_name` | VARCHAR(50) | e.g. `NIFTY`, `TCS` |
| `expiry` | DATE | |
| `strike_price` | DECIMAL(10,2) | |
| `option_type` | VARCHAR(2) | `CE` or `PE` |
| `delta` | DECIMAL(8,6) | |
| `gamma` | DECIMAL(8,6) | |
| `theta` | DECIMAL(8,6) | |
| `vega` | DECIMAL(8,6) | |
| `implied_volatility` | DECIMAL(6,3) | |
| `trade_volume` | DECIMAL(15,2) | |
| `ltp` | DECIMAL(10,2) | Option LTP at time of fetch |
| `updated_at` | TIMESTAMPTZ | |
**Index:** `(underlying_name, expiry, strike_price, option_type)` composite

### `paper_strategies` — Multi-leg basket parent
| Column | Type | Notes |
|---|---|---|
| `strategy_id` | UUID PK | |
| `user_id` | UUID FK | |
| `strategy_name` | VARCHAR(150) | e.g. `Iron Condor NIFTY June` |
| `underlying` | VARCHAR(50) | e.g. `NIFTY` (for payoff labelling) |
| `status` | VARCHAR(10) | `EXECUTED` → `CLOSED` |
| `net_premium` | DECIMAL(15,2) | Net credit (+) or debit (-) |
| `payoff_graph` | JSONB | `[{spot, pnl}, ...]` ±10% range array |
| `created_at` | TIMESTAMPTZ | |
| `closed_at` | TIMESTAMPTZ | Set when strategy is closed |

### `user_balances` — Virtual funds
| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID PK | |
| `balance` | DECIMAL(15,2) | Available liquid cash (starts at ₹10,00,000) |
| `locked_balance` | DECIMAL(15,2) | Frozen margin for pending LIMIT orders |
| `updated_at` | TIMESTAMPTZ | |

### `paper_orders` — Order log
| Column | Type | Notes |
|---|---|---|
| `order_id` | UUID PK | |
| `strategy_id` | UUID FK | NULL for standalone orders |
| `user_id` | UUID FK | |
| `token` | VARCHAR(50) | Angel One instrument token |
| `symbol` | VARCHAR(100) | |
| `exch_seg` | VARCHAR(20) | |
| `transaction_type` | VARCHAR(4) | `BUY` or `SELL` |
| `order_type` | VARCHAR(10) | `MARKET` or `LIMIT` |
| `price` | DECIMAL(10,2) | Execution or limit price |
| `quantity` | INT | |
| `status` | VARCHAR(12) | `PENDING` / `EXECUTED` / `REJECTED` / `CANCELLED` |
| `rejection_reason` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### `user_positions` — Active positions
| Column | Type | Notes |
|---|---|---|
| `position_id` | UUID PK | |
| `strategy_id` | UUID FK | NULL for standalone positions |
| `user_id` | UUID FK | |
| `token` | VARCHAR(50) | |
| `symbol` | VARCHAR(100) | |
| `exch_seg` | VARCHAR(20) | |
| `quantity` | INT | Negative for short (sold option) positions |
| `average_price` | DECIMAL(10,2) | Weighted average buy price |
**Unique constraints:**
- `(user_id, token) WHERE strategy_id IS NULL` — one standalone position per token
- `(user_id, token, strategy_id) WHERE strategy_id IS NOT NULL` — one per token per strategy

### `paper_trades` — Execution audit
| Column | Type | Notes |
|---|---|---|
| `trade_id` | UUID PK | |
| `order_id` | UUID FK | |
| `user_id` | UUID FK | |
| `token` | VARCHAR(50) | |
| `price` | DECIMAL(10,2) | Actual execution price |
| `quantity` | INT | |
| `executed_at` | TIMESTAMPTZ | |

---

## Redis Key Schema

| Key | Value | Written By | TTL |
|---|---|---|---|
| `at:market:ltp:token:{token}` | `"2450.50"` string | ws-live.ts | 1 hour |
| `at:market:ltp:{exchange}:{symbol}` | `"2450.50"` string | ws-live.ts | 1 hour |
| `at:market:quote:{exchange}:{symbol}` | JSON (full OHLCV) | ws-live.ts | 1 hour |
| `at:live:tick:{exchangeType}:{token}` | JSON raw tick | ws-live.ts | 1 hour |
| `scrip:search:{query}` | JSON array | strategy-api | 24 hours |
| `scrip:details:{token}` | JSON scrip object | strategy-api | 24 hours |
| `options:greeks:{name}:{expiry}` | JSON array (Greeks) | strategy-api | 5 min (market) / 1 hr |
| `at:market:session` | JSON (Angel One JWT) | ws-live.ts auth | ~24 hours |
| `active_tokens_registry` | Redis Hash `{token → count}` | strategy-api `/api/tokens/watch` | no TTL |

**OHLCV quote JSON structure:**
```json
{
  "symbol": "NIFTY 50", "exchange": "NSE", "token": "99926000",
  "ltp": 24850.50, "open": 24700.00, "high": 24920.75, "low": 24650.20,
  "close": 24810.90, "volume": 182000000,
  "netChange": 39.60, "percentChange": 0.1595,
  "updatedAt": 1750489800000
}
```

**market:ticks pub/sub payload (every ≤3 s per instrument):**
```json
{
  "token": "99926000", "exchange": "NSE",
  "ltp": 24850.50, "open": 24700.00, "high": 24920.75,
  "low": 24650.20, "close": 24810.90, "volume": 182000000,
  "ts": 1750489800000
}
```

---

## REST API Reference

---

### PAPER TRADING — `/api/paper/…`

---

#### 1. Place Order
```
POST /api/paper/orders/place
```
**Request body:**
```json
{
  "token":            "2885",
  "transaction_type": "BUY",
  "order_type":       "MARKET",
  "quantity":         10
}
```
For LIMIT orders, add `"price": 2480.00`.

**Response (MARKET executed):**
```json
{ "status": "EXECUTED", "order_id": "uuid", "price": 2450.50, "quantity": 10 }
```
**Response (LIMIT pending):**
```json
{ "status": "PENDING", "order_id": "uuid", "limit_price": 2480.00 }
```
**Response (rejected):**
```json
{ "status": "REJECTED", "reason": "Insufficient Funds", "order_id": "uuid" }
```

| Error Code | Meaning |
|---|---|
| `INVALID_TOKEN` | Token not in `angle_scrip` table |
| `NO_PRICE` | No price found in Redis or Postgres — load bhavcopy or wait for live feed |
| `INSUFFICIENT_FUNDS` | Balance too low for BUY order |
| `INSUFFICIENT_HOLDINGS` | Selling more than held |

---

#### 2. Cancel Order
```
POST /api/paper/orders/cancel
Body: { "order_id": "uuid" }
```
Only cancels `PENDING` orders. For BUY LIMIT, releases locked balance.
```json
{ "status": "CANCELLED", "order_id": "uuid" }
```

---

#### 3. Get Positions
```
GET /api/paper/portfolio/positions
```
```json
{
  "positions": [{
    "position_id": "uuid", "token": "2885", "symbol": "RELIANCE-EQ",
    "exch_seg": "NSE", "quantity": 10, "average_price": 2440.00,
    "ltp": 2450.50, "high": 2465.75, "low": 2415.20, "prev_close": 2438.90,
    "pnl": 105.00, "pnl_pct": 0.43
  }],
  "count": 1
}
```
Returns **only standalone positions** (no strategy_id). Use `GET /api/strategies/{id}` for strategy positions.

---

#### 4. Get Orders
```
GET /api/paper/portfolio/orders
```
Returns last 200 orders (newest first) for the user.

---

#### 5. Get Balance
```
GET /api/paper/user/balance
```
```json
{ "total": 1000000.00, "available": 975500.00, "locked_balance": 24500.00 }
```

---

### OPTION GREEKS — `/api/options/…`

---

#### 6. Fetch Option Chain Greeks (POST)
```
POST /api/options/chain-greeks
```
**Request body:**
```json
{ "name": "NIFTY", "expirydate": "25JAN2024" }
```

**Execution flow:**
1. Check Redis `options:greeks:NIFTY:25JAN2024` → return immediately if hit (5-min TTL)
2. On miss: try Postgres `option_greeks_cache` (fastest fallback, no external call)
3. If no Postgres data and Angel One session active (`at:market:session` in Redis): call Angel One SmartAPI
4. Bulk upsert into `option_greeks_cache`, cache in Redis (5 min market hours / 1 hr off-hours)
5. Return grouped CE + PE chains

**Response:**
```json
{
  "underlying": "NIFTY",
  "expirydate": "25JAN2024",
  "total_strikes": 50,
  "ce_chain": [
    {
      "strikePrice": 24800,
      "optionType": "CE",
      "ltp": 120.50,
      "delta": 0.482,
      "gamma": 0.00182,
      "theta": -8.45,
      "vega": 12.30,
      "impliedVolatility": 14.25,
      "tradeVolume": 2500000
    }
  ],
  "pe_chain": [ ... ],
  "raw": [ ... ],
  "source": "angel_one",
  "timestamp": "2024-01-25T11:30:00+05:30"
}
```

**Note:** If no Postgres cache exists and no Angel One session is active, returns `503 NO_DATA`. During market hours ws-live.ts auto-logs in, setting `at:market:session`; off-hours, Postgres cache from the last market session is used.

---

#### 7. Read Greeks from DB (GET)
```
GET /api/options/chain-greeks?name=NIFTY&expiry=2024-01-25
```
Reads from `option_greeks_cache` table — useful for off-hours analysis or audit.
```json
{
  "underlying": "NIFTY",
  "expiry": "2024-01-25",
  "count": 100,
  "records": [ ... ],
  "source": "postgres"
}
```

---

### STRATEGY BASKET — `/api/strategies/…`

---

#### 8. Execute Multi-Leg Strategy
```
POST /api/strategies/execute
```
Atomically executes all legs in one database transaction. Creates a `paper_strategies` parent row linking all orders and positions.

**Request body:**
```json
{
  "strategy_name": "Iron Condor NIFTY June",
  "underlying": "NIFTY",
  "legs": [
    { "token": "token_for_25200CE", "transaction_type": "SELL", "quantity": 50 },
    { "token": "token_for_25400CE", "transaction_type": "BUY",  "quantity": 50 },
    { "token": "token_for_24800PE", "transaction_type": "SELL", "quantity": 50 },
    { "token": "token_for_24600PE", "transaction_type": "BUY",  "quantity": 50 }
  ]
}
```
Max 10 legs per basket.

**Response:**
```json
{
  "strategy_id":   "uuid",
  "strategy_name": "Iron Condor NIFTY June",
  "status":        "EXECUTED",
  "net_premium":   4250.00,
  "legs": [
    { "order_id": "uuid", "symbol": "NIFTY25JUN25200CE", "transaction_type": "SELL",
      "quantity": 50, "price": 120.50 },
    ...
  ],
  "payoff_graph": [
    { "spot": 22365.00, "pnl": 4250.00 },
    { "spot": 22925.50, "pnl": 4250.00 },
    { "spot": 24800.00, "pnl": 1200.00 },
    { "spot": 24850.00, "pnl": -2100.00 },
    ...
    { "spot": 27335.00, "pnl": 4250.00 }
  ]
}
```

**Payoff graph details:**
- 41 data points from `spot × 0.90` to `spot × 1.10`
- Uses intrinsic value at expiry: `CE = max(0, spot - strike)`, `PE = max(0, strike - spot)`
- SELL legs: `pnl = (premium_received - intrinsic) × qty`
- BUY legs: `pnl = (intrinsic - premium_paid) × qty`

---

#### 9. Close Strategy
```
POST /api/strategies/close
Body: { "strategy_id": "uuid" }
```
Closes all open positions at current market prices. Returns realised P&L.
```json
{
  "strategy_id":  "uuid",
  "status":       "CLOSED",
  "realised_pnl": 3850.00,
  "closed_legs": [
    { "token": "...", "symbol": "NIFTY25JUN25200CE", "pnl": 2100.00 }
  ]
}
```

---

#### 10. List Strategies
```
GET /api/strategies/list
GET /api/strategies/list?status=EXECUTED
GET /api/strategies/list?status=CLOSED&limit=20
```
```json
{
  "strategies": [{
    "strategy_id":   "uuid",
    "strategy_name": "Iron Condor NIFTY June",
    "underlying":    "NIFTY",
    "status":        "EXECUTED",
    "net_premium":   4250.00,
    "leg_count":     4,
    "created_at":    "2026-06-21T10:35:00+05:30",
    "closed_at":     null
  }],
  "count": 1
}
```

---

#### 11. Get Strategy Detail
```
GET /api/strategies/{strategy_id}
```
Returns full strategy with legs, current positions (LTP + H/L + P&L), and payoff graph.
```json
{
  "strategy_id":   "uuid",
  "strategy_name": "Iron Condor NIFTY June",
  "underlying":    "NIFTY",
  "status":        "EXECUTED",
  "net_premium":   4250.00,
  "current_pnl":   1200.00,
  "created_at":    "2026-06-21T10:35:00+05:30",
  "closed_at":     null,
  "legs":     [ ... ],
  "positions": [{
    "symbol":        "NIFTY25JUN25200CE",
    "quantity":      -50,
    "average_price":  120.50,
    "ltp":            85.25,
    "high":          125.00,
    "low":            80.00,
    "prev_close":    112.00,
    "pnl":           1762.50
  }],
  "payoff_graph": [ ... ]
}
```

---

### SCRIP SEARCH — `/api/scrip/…`

---

#### 12. Search Instruments
```
GET /api/scrip/search?q=RELIANCE
GET /api/scrip/search?q=NIFTY24JUN
GET /api/scrip/search?q=TCS
```
Redis-first (24 h cache) → Postgres ILIKE fallback. Returns up to 15 results.

```json
{
  "results": [
    {
      "token": "2885", "symbol": "RELIANCE-EQ", "name": "RELIANCE INDUSTRIES LTD",
      "exch_seg": "NSE", "instrumenttype": "EQ", "lotsize": 1,
      "strike": null, "expiry": null
    },
    {
      "token": "58662", "symbol": "RELIANCE25JUN3000CE",
      "name": "RELIANCE", "exch_seg": "NFO", "instrumenttype": "OPTSTK",
      "lotsize": 250, "strike": 3000.00, "expiry": "2025-06-26"
    }
  ],
  "source": "cache"
}
```
`source`: `"cache"` (~1 ms) or `"db"` (~5–20 ms).

---

### ACTIVE TOKEN REGISTRY — `/api/tokens/…`

---

#### 13. Watch Tokens
```
POST /api/tokens/watch
Body: { "tokens": ["2885", "1594", "99926000"] }
```
Increments `HINCRBY active_tokens_registry {token} 1` in Redis for each token. Call when the user opens a watchlist screen, option chain, or chart.

```json
{ "registered": 3, "tokens": ["2885","1594","99926000"], "action": "watch" }
```

---

#### 14. Unwatch Tokens
```
POST /api/tokens/unwatch
Body: { "tokens": ["2885", "1594"] }
```
Decrements counters. Tokens that reach 0 are removed from the registry.
```json
{
  "unregistered": 2,
  "removed_from_registry": ["1594"],
  "still_active": ["2885"],
  "action": "unwatch"
}
```

---

#### 15. List Active Tokens
```
GET /api/tokens/active
```
```json
{
  "active_tokens": { "2885": 3, "99926000": 7, "99926009": 5 },
  "total": 3
}
```

---

### WEBSOCKET STREAM — `ws://…/ws/stream`

---

#### 16. Real-Time Market Tick Stream

Connect: `wss://abhitrade.online/ws/stream`

**Step 1 — Subscribe** (send immediately after connect):
```json
["2885", "1594", "99926000", "99926009", "99919000"]
```
Or with object syntax: `{ "tokens": ["2885", "1594"] }`

**Step 2 — Receive ticks** (pushed every ≤3 s per instrument):
```json
{
  "token": "99926000", "exchange": "NSE",
  "ltp": 24850.50, "open": 24700.00,
  "high": 24920.75, "low": 24650.20,
  "close": 24810.90, "volume": 182000000,
  "ts": 1750489800000
}
```

| Field | Description |
|---|---|
| `ltp` | Last traded price |
| `open` | Day open |
| `high` | Day high (cumulative max, tracked by ws-live.ts) |
| `low` | Day low (cumulative min) |
| `close` | **Previous day close** (use for change % calculation) |
| `volume` | Cumulative day volume |
| `ts` | Epoch ms (IST) |

**React hook:**
```typescript
const ws = new WebSocket('wss://abhitrade.online/ws/stream');
ws.onopen = () => ws.send(JSON.stringify(tokens));
ws.onmessage = (e) => {
  const tick = JSON.parse(e.data);
  const change = tick.ltp - tick.close;
  const changePct = (change / tick.close) * 100;
  // update UI: LTP, H, L, change, changePct
};
```

---

## Frontend Integration Map

| Page / Component | API to call |
|---|---|
| **Header index chips (NIFTY/SENSEX)** | WS `/ws/stream` — tokens `99926000`, `99926009`, `99919000` — shows LTP + H + L |
| **Global search bar** | `GET /api/scrip/search?q=` (debounce 300 ms) — result.token → order panel |
| **Watchlist rows** | WS `/ws/stream` + `POST /api/tokens/watch` on mount, `unwatch` on unmount |
| **Option chain screen** | `POST /api/options/chain-greeks` — full CE/PE Greeks table |
| **Order panel — place order** | Search → `POST /api/paper/orders/place` |
| **Order panel — cancel** | `POST /api/paper/orders/cancel` |
| **Portfolio — balance** | `GET /api/paper/user/balance` (poll 30 s or after order) |
| **Portfolio — positions** | `GET /api/paper/portfolio/positions` (poll 10 s + after order) |
| **Portfolio — orders** | `GET /api/paper/portfolio/orders` |
| **Strategy builder — execute** | `POST /api/strategies/execute` |
| **Strategy builder — close** | `POST /api/strategies/close` |
| **Strategy list page** | `GET /api/strategies/list` |
| **Strategy detail / payoff chart** | `GET /api/strategies/{id}` — use `payoff_graph` array for chart |
| **Charts panel (open screen)** | `POST /api/tokens/watch` for the charted token |
| **Charts panel (close screen)** | `POST /api/tokens/unwatch` |

---

## Background Worker Behaviour

### Paper Trading — No Angel One Required

Paper trading is **fully virtual and available 24/7**. Angel One is used only for market data collection — the paper order engine never calls Angel One directly.

**Price resolution order (paper orders):**
1. Redis `at:market:ltp:token:{token}` — live feed written by ws-live.ts every 3 s (fastest)
2. Redis `at:live:tick:{et}:{token}` — raw tick JSON for exchange types 1–5
3. Redis `at:market:quote:{exchange}:{symbol}` — full OHLCV by symbol
4. Postgres `market_quotes.ltp` — last persisted live price (ws-live.ts upserts after flush)
5. Postgres `angle_scrip.ltp` — EOD / bhavcopy price (always available after daily scrip sync)

Orders placed outside market hours use the last stored price (step 4 or 5). The `MARKET_CLOSED` error code **does not exist** in the paper trading engine.

### Limit Order Engine (2-second poll)
- Queries all `status='PENDING'` rows from `paper_orders`
- Reads LTP from Redis first (`at:market:ltp:token:{token}`), falls back to `resolve_price()` (Postgres) if Redis miss
- **BUY** triggers: `LTP ≤ limit_price`
- **SELL** triggers: `LTP ≥ limit_price`
- On trigger: unfreezes locked balance, marks `EXECUTED`, creates `paper_trades` record, updates `user_positions`
- Uses `FOR UPDATE` lock to prevent double-execution

### Daily Scrip Sync (08:30 IST weekdays)
- Downloads `OpenAPIScripMaster.json` from Angel One CDN (no auth needed)
- Upserts into `angle_scrip` in 1,000-row batches using `ON CONFLICT (token) DO UPDATE`
- Also runs once immediately on API startup
- URL: `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`

### Option Greeks Caching
- Redis TTL: **5 minutes** during 09:15–15:30 IST, **1 hour** outside market hours
- **Postgres `option_greeks_cache` is checked first** before calling Angel One — provides instant off-hours responses
- Angel One API is only called when: Redis miss AND no Postgres data AND session token available
- Off-hours Greeks requests are served entirely from Postgres (no Angel One session needed)

---

## Error Response Format

```json
{ "error": "Human-readable message", "code": "MACHINE_READABLE_CODE" }
```

Validation error (422):
```json
{
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "details": { "quantity": ["quantity must be positive"] }
}
```

---

## Environment Variables (strategy-api)

**strategy-api (FastAPI) — `.env` or Docker Compose env:**

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | `postgres` | |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_USER` | `tradekaro` | |
| `POSTGRES_PASSWORD` | `tradekaro` | |
| `POSTGRES_DB` | `abhitrade_live` | |
| `REDIS_HOST` | `redis` | |
| `REDIS_PORT` | `6379` | |
| `REDIS_PASSWORD` | _(empty)_ | |
| `JWT_SECRET` | `change-me` | Must match Next.js JWT_SECRET |
| `AUTH_ENABLED` | `true` | `false` for local dev |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated |

**Next.js (`.env.local`) — needed for frontend components:**

| Variable | Dev value | Prod value | Description |
|---|---|---|---|
| `NEXT_PUBLIC_STRATEGY_API_URL` | _(empty / omit)_ | _(empty / omit)_ | Leave empty — all calls use same-origin through nginx. Do NOT set to `http://localhost:8000`; that port is internal-only and unreachable from browsers. |

---

## Nginx Routing (Production)

| Path pattern | Proxied to |
|---|---|
| `/api/strategies/*` | `strategy-api:8000` |
| `/api/backtests/*` | `strategy-api:8000` |
| `/api/paper/*` | `strategy-api:8000` |
| `/api/scrip/*` | `strategy-api:8000` |
| `/api/options/*` | `strategy-api:8000` |
| `/api/tokens/*` | `strategy-api:8000` |
| `/ws/stream` | `strategy-api:8000` (WebSocket upgrade) |
| `/api/*` (everything else) | `app:3000` (Next.js) |

---

## Quick Start

```bash
# Start all services
docker-compose up -d --build

# Health check (through nginx — same URL the browser uses)
curl http://localhost/api/paper/user/balance -H "Authorization: Bearer <jwt>"

# Direct swagger UI (only reachable from inside Docker, or from WSL2 host)
# docker-compose exec strategy-api sh -c "curl http://localhost:8000/docs"

# Get a JWT for testing (run from WSL2 — replace secret and user_id):
python3 -c "
import jwt, datetime, uuid
secret = 'abhitrade-dev-secret-change-in-production'  # from .env.local JWT_SECRET
user_id = '<uuid from users table>'  # SELECT id FROM users LIMIT 1;
token = jwt.encode({'sub': user_id, 'email': 'x@x.com',
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)},
                   secret, algorithm='HS256')
print(token)
"

# Search a scrip (no auth needed — public route)
curl "http://localhost/api/scrip/search?q=NIFTY"

# Place a paper LIMIT buy
curl -X POST http://localhost/api/paper/orders/place \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"token":"2885","transaction_type":"BUY","order_type":"LIMIT","quantity":10,"price":1480.00}'

# Place a paper MARKET buy (requires price data in angle_scrip or Redis)
curl -X POST http://localhost/api/paper/orders/place \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"token":"2885","transaction_type":"BUY","order_type":"MARKET","quantity":10}'

# Execute Iron Condor basket
curl -X POST http://localhost/api/strategies/execute \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_name": "Iron Condor NIFTY",
    "underlying": "NIFTY",
    "legs": [
      {"token":"ce_sell_token","transaction_type":"SELL","quantity":50},
      {"token":"ce_buy_token", "transaction_type":"BUY", "quantity":50},
      {"token":"pe_sell_token","transaction_type":"SELL","quantity":50},
      {"token":"pe_buy_token", "transaction_type":"BUY", "quantity":50}
    ]
  }'

# Fetch option Greeks
curl -X POST http://localhost/api/options/chain-greeks \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"NIFTY","expirydate":"25JAN2024"}'

# Register watchlist tokens
curl -X POST http://localhost/api/tokens/watch \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"tokens":["99926000","99926009","2885"]}'
```

> **Note:** All `curl` examples use `http://localhost` (port 80, through nginx). Port 8000 is **never** exposed to the host — direct access to strategy-api only works from inside Docker containers.
