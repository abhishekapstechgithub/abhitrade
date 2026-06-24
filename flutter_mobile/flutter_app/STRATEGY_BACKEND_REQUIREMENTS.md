# Strategy Builder — Backend Requirements (Production Level)

> **Scope:** Every API endpoint, database table, real-time feed, computation function, and third-party integration needed to turn the current client-side Strategy Builder into a fully production-ready feature.

---

## 1. Data Sources (Third-Party / Market Data)

You need a licensed market data provider. Pick **one**:

| Provider | What you get | Cost |
|---|---|---|
| **Angel One SmartAPI** | WebSocket tick feed, option chain, historical OHLCV | Free (need broker account) |
| **Upstox API v2** | WebSocket, option chain, historical data | Free (Upstox account) |
| **NSE India (unofficial scrape)** | Option chain JSON, index prices | Free but fragile, ToS risk |
| **True Data / Global Data Feed** | Professional tick feed, historical IV | Paid ₹2K–10K/month |
| **Dhan API** | WebSocket, option chain | Free |

> **Minimum required feeds:**
> - Index LTP + change (NIFTY 50, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY) — 1s interval
> - Full option chain per underlying (all strikes, all expiries) — 5s interval or on-demand
> - Historical daily OHLCV for each underlying — daily update

---

## 2. Database Schema

### 2.1 `underlying` table
```sql
CREATE TABLE underlying (
  id            SERIAL PRIMARY KEY,
  symbol        VARCHAR(20) UNIQUE NOT NULL,   -- 'NIFTY 50', 'BANKNIFTY'
  display_name  VARCHAR(50),
  lot_size      INT NOT NULL,
  tick_size     DECIMAL(6,2) DEFAULT 0.05,
  market_type   VARCHAR(10) DEFAULT 'INDEX'    -- INDEX | STOCK
);
```

### 2.2 `option_expiry` table
```sql
CREATE TABLE option_expiry (
  id            SERIAL PRIMARY KEY,
  underlying_id INT REFERENCES underlying(id),
  expiry_date   DATE NOT NULL,
  expiry_type   VARCHAR(10),                   -- 'weekly' | 'monthly'
  is_active     BOOLEAN DEFAULT TRUE,
  UNIQUE(underlying_id, expiry_date)
);
```

### 2.3 `option_contract` table
```sql
CREATE TABLE option_contract (
  id            SERIAL PRIMARY KEY,
  underlying_id INT REFERENCES underlying(id),
  expiry_id     INT REFERENCES option_expiry(id),
  strike        DECIMAL(10,2) NOT NULL,
  option_type   CHAR(2) NOT NULL,              -- 'CE' | 'PE'
  token         VARCHAR(20) UNIQUE,            -- broker instrument token
  trading_symbol VARCHAR(50),
  UNIQUE(underlying_id, expiry_id, strike, option_type)
);
```

### 2.4 `option_quote` table (latest tick — hot table, Redis preferred)
```sql
-- Use Redis hash instead of Postgres for real-time:
-- KEY: quote:{token}
-- FIELDS: ltp, open, high, low, close, volume, oi, iv, bid, ask, updated_at

-- Postgres version for persistence / fallback:
CREATE TABLE option_quote (
  token         VARCHAR(20) PRIMARY KEY REFERENCES option_contract(token),
  ltp           DECIMAL(10,2),
  open          DECIMAL(10,2),
  high          DECIMAL(10,2),
  low           DECIMAL(10,2),
  prev_close    DECIMAL(10,2),
  volume        BIGINT,
  open_interest BIGINT,
  iv            DECIMAL(6,4),                  -- implied volatility (e.g. 0.1245)
  bid           DECIMAL(10,2),
  ask           DECIMAL(10,2),
  delta         DECIMAL(8,6),
  gamma         DECIMAL(10,8),
  theta         DECIMAL(8,4),
  vega          DECIMAL(8,4),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 2.5 `iv_history` table (for IV Rank / Percentile)
```sql
CREATE TABLE iv_history (
  id            SERIAL PRIMARY KEY,
  underlying_id INT REFERENCES underlying(id),
  date          DATE NOT NULL,
  iv_close      DECIMAL(6,4) NOT NULL,         -- daily closing IV (from ATM options)
  UNIQUE(underlying_id, date)
);
-- Minimum 1 year of history needed for IV Rank/Percentile
```

### 2.6 `saved_strategy` table
```sql
CREATE TABLE saved_strategy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(100) NOT NULL,
  underlying    VARCHAR(20) NOT NULL,
  sentiment     VARCHAR(20),                   -- 'Bullish' | 'Bearish' | 'Neutral'
  legs_json     JSONB NOT NULL,                -- array of leg objects (see below)
  params_json   JSONB,                         -- iv, dte, spot at time of save
  analysis_json JSONB,                         -- cached max_profit, max_loss, breakeven, pop
  tags          TEXT[],
  is_template   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- legs_json shape:
-- [
--   {
--     "underlying": "NIFTY",
--     "expiry": "2024-06-26",
--     "strike": 24500,
--     "option_type": "CE",
--     "side": "BUY",
--     "lots": 1,
--     "premium": 310.25,
--     "lot_size": 75,
--     "token": "35003"
--   }
-- ]
```

### 2.7 `strategy_template` table
```sql
CREATE TABLE strategy_template (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,         -- 'Bull Call Spread'
  sentiment     VARCHAR(20),
  description   TEXT,
  legs_template JSONB NOT NULL,               -- relative leg definition (see below)
  icon_name     VARCHAR(50),
  sort_order    INT DEFAULT 0
);

-- legs_template shape (strike offsets relative to ATM):
-- [
--   {"option_type": "CE", "side": "BUY",  "strike_offset": 0,     "lots": 1},
--   {"option_type": "CE", "side": "SELL", "strike_offset": +500,  "lots": 1}
-- ]
```

### 2.8 `strategy_backtest` table
```sql
CREATE TABLE strategy_backtest (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   UUID REFERENCES saved_strategy(id),
  user_id       UUID NOT NULL,
  period_from   DATE,
  period_to     DATE,
  result_json   JSONB,                         -- P&L curve, win rate, max DD, Sharpe
  run_at        TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. REST API Endpoints

Base path: `/api/strategy`

### 3.1 Option Chain

```
GET /api/option-chain
  Query params:
    underlying  : string  (required) e.g. "NIFTY 50"
    expiry      : string  (required) e.g. "2024-06-26"
    strikes     : int     (optional, default 20) — number of strikes to return
  
  Response 200:
  {
    "underlying": "NIFTY 50",
    "spot": 24567.80,
    "expiry": "2024-06-26",
    "dte": 4,
    "strikes": [
      {
        "strike": 24300,
        "calls": { "ltp": 712.40, "iv": 0.121, "oi": 123456, "volume": 4567, "bid": 711.00, "ask": 713.00, "delta": 0.72, "theta": -8.4, "gamma": 0.0012 },
        "puts":  { "ltp": 115.30, "iv": 0.134, "oi": 234567, "volume": 3456, "bid": 114.00, "ask": 116.00, "delta": -0.28, "theta": -5.2, "gamma": 0.0012 }
      },
      ...
    ],
    "pcr": 0.92,
    "timestamp": "2024-06-22T10:30:00Z"
  }
  Auth: Required
  Cache: Redis 3s TTL
```

### 3.2 Option Expiries

```
GET /api/option-expiries
  Query params:
    underlying: string (required)
  
  Response 200:
  {
    "underlying": "NIFTY 50",
    "expiries": [
      { "date": "2024-06-26", "dte": 4, "type": "weekly" },
      { "date": "2024-07-25", "dte": 33, "type": "monthly" },
      ...
    ]
  }
  Auth: Not required
  Cache: Redis 60s TTL
```

### 3.3 IV Data (Rank, Percentile, History)

```
GET /api/iv-data
  Query params:
    underlying: string (required)
    expiry    : string (required)
  
  Response 200:
  {
    "underlying": "NIFTY 50",
    "current_iv": 0.1245,
    "iv_rank": 45.2,          -- (current_iv - 52w_low) / (52w_high - 52w_low) * 100
    "iv_percentile": 61.8,    -- % of days in past year where IV was BELOW current
    "iv_52w_high": 0.2234,
    "iv_52w_low": 0.0812,
    "history": [              -- last 30 days for sparkline
      { "date": "2024-06-21", "iv": 0.1210 },
      ...
    ]
  }
  Auth: Required
  Cache: Redis 60s TTL
```

### 3.4 Greeks Computation (Server-Side)

```
POST /api/strategy/greeks
  Body:
  {
    "spot": 24567.80,
    "iv": 0.1245,
    "dte": 32,
    "risk_free_rate": 0.07,
    "legs": [
      { "strike": 24500, "option_type": "CE", "side": "BUY", "lots": 1, "lot_size": 75, "premium": 310.25 },
      { "strike": 25000, "option_type": "CE", "side": "SELL", "lots": 1, "lot_size": 75, "premium": 135.25 }
    ]
  }
  
  Response 200:
  {
    "position": {
      "delta": 0.38,
      "gamma": 0.0021,
      "theta": -215.6,
      "vega": 142.3,
      "rho": 38.6,
      "charm": -12.4,
      "vanna": 65.2,
      "net_premium_cr": 175000
    },
    "per_lot": {
      "delta": 0.19,
      "gamma": 0.00105,
      "theta": -107.8,
      "vega": 71.15,
      "rho": 19.3,
      "charm": -6.2,
      "vanna": 32.6
    },
    "legs": [
      { "ltp": 312.40, "delta": 0.62, "gamma": 0.0022, "theta": -8.4, "vega": 9.8, "iv": 0.1240, "moneyness": "ITM" },
      { "ltp": 136.10, "delta": -0.28, "gamma": 0.0020, "theta": -7.2, "vega": 8.8, "iv": 0.1310, "moneyness": "OTM" }
    ],
    "analysis": {
      "max_profit": 425000,
      "max_loss": -131250,
      "breakeven": [24675.0],
      "pop": 45.2,
      "rr_ratio": "1:3.24"
    }
  }
  Auth: Required
  Note: Use server-side Black-Scholes. Client-side computation is fine for display
        but server must be authoritative for order placement validation.
```

### 3.5 Payoff Chart Data

```
POST /api/strategy/payoff
  Body:
  {
    "spot": 24567.80,
    "iv": 0.1245,
    "dte": 32,
    "legs": [...],
    "price_range_pct": 0.20,   -- ±20% from spot
    "points": 200              -- number of data points
  }
  
  Response 200:
  {
    "expiry_pnl": [            -- [[price, pnl], ...]
      [19654.24, -131250],
      [19752.10, -131250],
      ...
      [29481.36, 243750]
    ],
    "t0_pnl": [                -- current-date P&L using BS pricing
      [19654.24, -28432],
      ...
    ],
    "breakeven": [24675.0],
    "spot": 24567.80,
    "max_profit": 243750,
    "max_loss": -131250
  }
  Auth: Required
  Note: Expensive computation — cache 30s by (legs_hash + params_hash)
```

### 3.6 Strategy Builder — Auto-Build

```
POST /api/strategy/build
  Body:
  {
    "underlying": "NIFTY 50",
    "sentiment": "Bullish",         -- 'Bullish' | 'Bearish' | 'Neutral' | 'Volatile'
    "expiry": "2024-06-26",
    "max_legs": 2,
    "max_risk_cr": null,            -- null = Any
    "min_pop": null,                -- null = Any
    "max_premium_cr": null          -- null = Any
  }
  
  Response 200:
  {
    "strategies": [
      {
        "template_name": "Bull Call Spread",
        "legs": [...],
        "analysis": { "max_profit": 425000, "max_loss": -131250, "pop": 45, "breakeven": [24675] },
        "net_premium": 175000,
        "score": 87.4              -- internal ranking score
      },
      ...
    ]
  }
  Auth: Required
```

### 3.7 Saved Strategies CRUD

```
GET    /api/strategy/saved
  Query: page, limit, search, sentiment
  Response: { strategies: [...], total: int, page: int }

POST   /api/strategy/saved
  Body: { name, underlying, sentiment, legs_json, params_json }
  Response: { id, ...strategy }

GET    /api/strategy/saved/:id
  Response: { ...strategy, analysis_json }

PATCH  /api/strategy/saved/:id
  Body: { name?, sentiment?, legs_json?, tags? }
  Response: { ...updated_strategy }

DELETE /api/strategy/saved/:id
  Response: 204 No Content

POST   /api/strategy/saved/:id/duplicate
  Response: { ...new_strategy }

All above: Auth Required
```

### 3.8 Strategy Templates

```
GET /api/strategy/templates
  Query: sentiment (optional filter)
  
  Response 200:
  {
    "templates": [
      {
        "id": 1,
        "name": "Bull Call Spread",
        "sentiment": "Bullish",
        "description": "Buy lower strike CE, sell higher strike CE",
        "legs_template": [...],
        "icon_name": "bar_chart_outlined"
      },
      ...
    ]
  }
  Auth: Not required
  Cache: Redis 1h TTL

POST /api/strategy/templates/:id/apply
  Body: { underlying, expiry, spot, iv }
  Response: { legs: [...], analysis: {...} }
  -- Server resolves ATM strike, looks up live premiums, returns ready-to-use legs
  Auth: Required
```

### 3.9 Backtesting

```
POST /api/strategy/backtest
  Body:
  {
    "strategy_id": "uuid",          -- saved strategy to backtest
    "period_from": "2023-01-01",
    "period_to": "2024-01-01",
    "entry_day": "monday",          -- day of week to enter
    "entry_dte": 30,                -- enter at ~30 DTE
    "exit_dte": 5,                  -- exit at ~5 DTE or expiry
    "stop_loss_pct": 50,            -- exit if loss > 50% of max loss
    "target_pct": 75                -- exit if profit > 75% of max profit
  }
  
  Response 202 (async job):
  {
    "job_id": "uuid",
    "status": "queued",
    "estimated_seconds": 12
  }
  Auth: Required
  Note: Run in background queue (Celery / BullMQ). Poll or SSE for result.

GET /api/strategy/backtest/:job_id
  Response 200 when complete:
  {
    "status": "complete",
    "result": {
      "trades": 24,
      "win_rate": 62.5,
      "avg_pnl_per_trade": 18420,
      "total_pnl": 441480,
      "max_drawdown": -286000,
      "sharpe_ratio": 1.34,
      "pnl_curve": [[date, cumulative_pnl], ...]
    }
  }
```

---

## 4. Real-Time / WebSocket

### 4.1 Option Chain WebSocket

```
WS /ws/option-chain

Client sends subscribe message:
{
  "action": "subscribe",
  "underlying": "NIFTY 50",
  "expiry": "2024-06-26"
}

Server pushes every 2-3 seconds:
{
  "type": "chain_update",
  "underlying": "NIFTY 50",
  "expiry": "2024-06-26",
  "spot": 24612.35,
  "strikes": [
    { "strike": 24500, "ce_ltp": 318.40, "pe_ltp": 111.20, "ce_iv": 0.1235, "pe_iv": 0.1310, "ce_oi": 124500, "pe_oi": 231000 }
  ],
  "ts": 1719044400000
}

Client sends unsubscribe:
{ "action": "unsubscribe", "underlying": "NIFTY 50", "expiry": "2024-06-26" }
```

### 4.2 Strategy P&L Live Update

```
WS /ws/strategy-pnl

Client sends:
{
  "action": "watch",
  "session_id": "uuid",
  "legs": [
    { "token": "35003", "strike": 24500, "option_type": "CE", "side": "BUY", "lots": 1, "lot_size": 75, "entry_premium": 310.25 }
  ]
}

Server pushes when any leg LTP changes:
{
  "type": "pnl_update",
  "total_pnl": 4237.50,
  "leg_ltps": { "35003": 316.12, "35103": 134.88 },
  "delta": 0.385,
  "ts": 1719044400000
}
```

### 4.3 Existing Index Price SSE (already in app)

```
GET /api/stream/index-prices   (Server-Sent Events)
-- Already implemented, keep as-is
-- Extend to include FINNIFTY, MIDCPNIFTY if not already
```

---

## 5. Server-Side Computation Functions

These MUST run server-side for production (client-side BS is only for preview):

### 5.1 Black-Scholes Engine (Python / Node.js)

```python
import math
from scipy.stats import norm

def black_scholes(S, K, T, r, sigma, option_type):
    """
    S     : spot price
    K     : strike price
    T     : time to expiry in years
    r     : risk-free rate (e.g. 0.07)
    sigma : implied volatility (e.g. 0.1245)
    option_type: 'CE' or 'PE'
    Returns: dict with price, delta, gamma, theta, vega, rho
    """
    if T <= 0:
        intrinsic = max(0, S - K) if option_type == 'CE' else max(0, K - S)
        return {'price': intrinsic, 'delta': 0, 'gamma': 0, 'theta': 0, 'vega': 0, 'rho': 0}
    
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    df = math.exp(-r * T)
    
    if option_type == 'CE':
        price = S * norm.cdf(d1) - K * df * norm.cdf(d2)
        delta = norm.cdf(d1)
        rho   = K * T * df * norm.cdf(d2) / 100
    else:
        price = K * df * norm.cdf(-d2) - S * norm.cdf(-d1)
        delta = norm.cdf(d1) - 1
        rho   = -K * T * df * norm.cdf(-d2) / 100
    
    gamma = norm.pdf(d1) / (S * sigma * math.sqrt(T))
    theta = (-S * norm.pdf(d1) * sigma / (2 * math.sqrt(T))
             - r * K * df * (norm.cdf(d2) if option_type == 'CE' else norm.cdf(-d2))) / 365
    vega  = S * norm.pdf(d1) * math.sqrt(T) / 100
    charm = -norm.pdf(d1) * (2 * r * T - d2 * sigma * math.sqrt(T)) / (2 * T * sigma * math.sqrt(T))
    vanna = (vega / S) * (1 - d1 / (sigma * math.sqrt(T)))
    
    return {
        'price': round(price, 2), 'delta': round(delta, 6),
        'gamma': round(gamma, 8), 'theta': round(theta, 4),
        'vega':  round(vega, 4),  'rho':   round(rho, 4),
        'charm': round(charm, 6), 'vanna': round(vanna, 4)
    }
```

### 5.2 IV Solver (Newton-Raphson)

```python
def implied_volatility(market_price, S, K, T, r, option_type, max_iter=100, tol=1e-6):
    """
    Back-solve for IV given the market LTP.
    Used to compute real IV for each option in the chain.
    """
    sigma = 0.2  # initial guess
    for _ in range(max_iter):
        bs   = black_scholes(S, K, T, r, sigma, option_type)
        diff = bs['price'] - market_price
        if abs(diff) < tol:
            return round(sigma, 6)
        vega = bs['vega'] * 100  # un-scale vega
        if vega < 1e-10:
            break
        sigma -= diff / vega
        sigma = max(0.001, min(sigma, 10.0))
    return round(sigma, 6)
```

### 5.3 IV Rank / Percentile

```python
def compute_iv_rank_percentile(current_iv, iv_history_1y):
    """
    iv_history_1y: list of daily IV closes (floats) for past 252 trading days
    """
    if not iv_history_1y:
        return None, None
    
    low  = min(iv_history_1y)
    high = max(iv_history_1y)
    
    iv_rank = ((current_iv - low) / (high - low) * 100) if high != low else 50.0
    iv_percentile = (sum(1 for v in iv_history_1y if v < current_iv) / len(iv_history_1y) * 100)
    
    return round(iv_rank, 1), round(iv_percentile, 1)
```

### 5.4 Strategy Analysis (Max Profit, Max Loss, Breakeven, POP)

```python
def analyze_strategy(legs, spot, iv, dte, steps=1000):
    """
    Scan ±25% price range to compute analytical metrics.
    legs: list of leg dicts (strike, option_type, side, lots, lot_size, premium)
    """
    lo, hi  = spot * 0.75, spot * 1.25
    step    = (hi - lo) / steps
    prices  = [lo + i * step for i in range(steps + 1)]
    
    def expiry_pnl(s):
        total = 0
        for leg in legs:
            intrinsic = max(0, s - leg['strike']) if leg['option_type'] == 'CE' else max(0, leg['strike'] - s)
            sign = 1 if leg['side'] == 'BUY' else -1
            total += sign * (intrinsic - leg['premium']) * leg['lots'] * leg['lot_size']
        return total
    
    pnls       = [expiry_pnl(p) for p in prices]
    max_profit = max(pnls)
    max_loss   = min(pnls)
    pop        = sum(1 for pnl in pnls if pnl > 0) / len(pnls) * 100
    
    # Find breakeven(s) — sign changes
    breakevenS = []
    for i in range(1, len(pnls)):
        if pnls[i-1] * pnls[i] < 0:
            be = prices[i-1] - step * pnls[i-1] / (pnls[i] - pnls[i-1])
            breakevenS.append(round(be, 2))
    
    return {
        'max_profit':  round(max_profit, 2),
        'max_loss':    round(max_loss, 2),
        'breakeven':   breakevenS,
        'pop':         round(pop, 1),
        'rr_ratio':    round(max_profit / abs(max_loss), 2) if max_loss != 0 else 99
    }
```

### 5.5 Strategy Auto-Builder

```python
def auto_build_strategy(underlying, sentiment, expiry, spot, iv, dte,
                         max_legs=4, max_risk=None, min_pop=None):
    """
    Fetches live option chain, maps templates for the sentiment,
    selects ATM strike, looks up live premiums, returns ranked strategies.
    """
    templates = get_templates_by_sentiment(sentiment)
    atm_strike = round(spot / 50) * 50  # round to nearest 50
    chain = get_option_chain(underlying, expiry)  # from Redis/DB
    
    results = []
    for template in templates:
        legs = resolve_template_legs(template, atm_strike, chain, underlying, expiry)
        if not legs:
            continue
        analysis = analyze_strategy(legs, spot, iv, dte)
        
        # Apply filters
        if max_risk and analysis['max_loss'] < -max_risk:
            continue
        if min_pop and analysis['pop'] < min_pop:
            continue
        if max_legs and len(legs) > max_legs:
            continue
        
        score = compute_strategy_score(analysis, sentiment)
        results.append({'template_name': template['name'], 'legs': legs,
                        'analysis': analysis, 'score': score})
    
    return sorted(results, key=lambda x: x['score'], reverse=True)
```

---

## 6. Background Jobs

Use **Celery** (Python) or **BullMQ** (Node.js):

| Job | Trigger | Function |
|---|---|---|
| `sync_option_chain` | Every 3s during market hours | Fetch from broker, update Redis + Postgres |
| `sync_index_prices` | Every 1s during market hours | Fetch index LTP, push to SSE subscribers |
| `compute_daily_iv` | Daily at 3:35 PM IST | Compute closing ATM IV from option chain, insert to `iv_history` |
| `run_backtest` | On-demand (POST /backtest) | Run backtest computation in worker |
| `refresh_expiries` | Daily at 8 AM IST | Update `option_expiry` table for all underlyings |
| `cleanup_old_quotes` | Daily | Purge stale Redis keys for expired contracts |

---

## 7. Caching Strategy (Redis)

```
# Option chain — full chain per underlying per expiry
KEY:  chain:{underlying}:{expiry}          TTL: 3s (market hours), 60s (after market)
TYPE: JSON string

# Index prices — all underlyings
KEY:  index:prices                          TTL: 1s
TYPE: Redis Hash (field=symbol, value=JSON)

# IV data per underlying
KEY:  iv:{underlying}:{expiry}             TTL: 60s
TYPE: JSON string

# Single option quote
KEY:  quote:{token}                         TTL: 3s
TYPE: Redis Hash (fields: ltp, iv, oi, delta, ...)

# Strategy greeks (cache computed result)
KEY:  greeks:{sha256(legs+params)}          TTL: 5s
TYPE: JSON string

# Templates (static)
KEY:  strategy:templates                    TTL: 1h
TYPE: JSON string
```

---

## 8. Market Hours Handling

```
Market Open:  09:15 IST
Market Close: 15:30 IST
Pre-open:     09:00–09:15 IST

Rules:
- Real-time feeds active only 09:00–15:35 IST on weekdays (Mon–Fri)
- Expiry day (Thursday): options stop trading at 15:30 exactly
- National holidays: fetch from NSE calendar API or maintain a table
- After market: serve last known prices with a "Market Closed" indicator
- On weekends: serve previous Friday's close
```

```sql
CREATE TABLE market_holiday (
  date DATE PRIMARY KEY,
  description VARCHAR(100)
);
```

---

## 9. Security & Auth

All strategy APIs require JWT auth. Additional rules:

```
Rate limits (per user):
  GET /api/option-chain     : 30 req/min
  POST /api/strategy/greeks : 60 req/min
  POST /api/strategy/payoff : 30 req/min
  POST /api/strategy/build  : 10 req/min
  POST /api/strategy/backtest: 5 req/hour

Saved strategy limits (free tier):
  Max saved strategies: 10
  Max legs per strategy: 6

Input validation (server must enforce):
  - legs count: 1–6
  - lots: 1–50
  - strike must exist in option_contract table
  - expiry must be a valid active expiry
  - dte > 0 (reject expired strategies)
```

---

## 10. Flutter App Changes Needed

Once backend is ready, replace these client-side placeholders:

| Current (client-side) | Production replacement |
|---|---|
| `_calcBS()` used for IV display | Call `GET /api/option-chain` for real IV per strike |
| IV Rank = 45% (hardcoded) | Call `GET /api/iv-data` |
| IV Percentile = 62% (hardcoded) | Call `GET /api/iv-data` |
| Theta (Total/Daily) from local BS | Call `POST /api/strategy/greeks` |
| Rho, Charm, Vanna from local formulas | Call `POST /api/strategy/greeks` |
| Chain tab: BS-computed LTP | Call `GET /api/option-chain` (real market prices) |
| Saved strategies: demo data | Call `GET /api/strategy/saved` |
| Build tab: no actual building | Call `POST /api/strategy/build` |
| Backtested tab: coming soon | Call `POST /api/strategy/backtest` |
| Chart payoff: local scan | Keep local (fast enough for preview), or call `POST /api/strategy/payoff` for export/share |

### New Flutter providers needed:

```dart
// lib/providers/strategy_provider.dart
class StrategyProvider extends ChangeNotifier {
  List<SavedStrategy> savedStrategies = [];
  OptionChain? currentChain;
  IvData? ivData;
  bool loadingChain = false;
  
  Future<void> loadOptionChain(String underlying, String expiry) async { ... }
  Future<void> loadIvData(String underlying, String expiry) async { ... }
  Future<SavedStrategy> saveStrategy(StrategyPayload payload) async { ... }
  Future<void> deleteStrategy(String id) async { ... }
  Future<GreeksResult> computeGreeks(List<StrategyLeg> legs, double spot, double iv, double dte) async { ... }
  Future<List<BuiltStrategy>> buildStrategy(BuildParams params) async { ... }
}
```

---

## 11. Tech Stack Recommendation

| Component | Recommended |
|---|---|
| API Server | **Node.js + Fastify** or **Python + FastAPI** |
| Database | **PostgreSQL 15+** (Supabase works) |
| Cache | **Redis 7** (Upstash for managed) |
| Background jobs | **BullMQ** (Node) or **Celery + Redis** (Python) |
| Market data | **Angel One SmartAPI** or **Dhan API** (free, just need broker account) |
| Math engine | **Python (scipy/numpy)** for BS + IV solver (call as microservice if Node backend) |
| WebSocket | **Socket.io** or native WS |
| Hosting | **Railway** / **Render** / **AWS EC2 t3.small** |

---

## 12. Priority Order (Build Sequence)

```
Phase 1 — Core data (2–3 weeks)
  ✅ Market data ingestion from broker API
  ✅ Redis option chain cache
  ✅ GET /api/option-chain endpoint
  ✅ GET /api/option-expiries endpoint
  ✅ Real-time IV computation (Newton-Raphson solver)

Phase 2 — Strategy engine (2 weeks)
  ✅ POST /api/strategy/greeks
  ✅ POST /api/strategy/payoff
  ✅ GET /api/iv-data (with iv_history table seeded)

Phase 3 — User strategies (1 week)
  ✅ CRUD /api/strategy/saved
  ✅ GET /api/strategy/templates
  ✅ POST /api/strategy/templates/:id/apply

Phase 4 — Builder + Backtest (2–3 weeks)
  ✅ POST /api/strategy/build (auto-builder)
  ✅ POST /api/strategy/backtest + job queue

Phase 5 — Real-time (1 week)
  ✅ WS /ws/option-chain
  ✅ WS /ws/strategy-pnl
  ✅ Flutter app wired to all real endpoints
```

---

*Document generated for AbhiTrade — Strategy Builder production requirements v1.0*
