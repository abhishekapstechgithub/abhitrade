# AbhiTrade Mobile API Integration Guide

Complete REST + SSE API reference for integrating the Flutter / React Native mobile app.

---

## Base URL

| Environment | Base URL |
|---|---|
| Production  | `https://abhitrade.online/api` |
| Local dev   | `http://localhost:3000/api`   |

All endpoints are under `/api`. HTTPS is required in production (nginx terminates SSL).

---

## Authentication

### How it works

- **Access token** — a short-lived JWT (15 minutes). Send in every authenticated request as `Authorization: Bearer <token>`.
- **Refresh token** — a long-lived opaque token (7 days). Stored in an `HttpOnly` cookie (`tk_refresh`) on web. For **mobile** send it manually in the `X-Refresh-Token` header.
- On 401, call `/api/auth/refresh` to get a new access token without re-login.

### Public routes (no token needed)

`/api/auth/*`, `/api/search`, `/api/quote`, `/api/quotes`, `/api/index-prices`,
`/api/market-stream`, `/api/market-data`, `/api/optionchain*`, `/api/tokens/*`,
`/api/scrips`, `/api/health`

### Protected routes (Bearer token required)

`/api/orders`, `/api/positions`, `/api/holdings`, `/api/watchlists`, `/api/alerts`

---

## 1. Auth APIs

### 1.1 Register

```
POST /api/auth/login
Content-Type: application/json

{
  "email":    "user@example.com",
  "password": "yourpassword",
  "name":     "Abhishek",
  "register": true
}
```

**Response 200**
```json
{
  "accessToken": "eyJhbGc...",
  "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek" }
}
```

---

### 1.2 Login

```
POST /api/auth/login
Content-Type: application/json

{
  "email":    "user@example.com",
  "password": "yourpassword"
}
```

**Response 200**
```json
{
  "accessToken": "eyJhbGc...",
  "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek" }
}
```

The refresh token is set as a cookie. On mobile, read it from the `Set-Cookie` response header and store it securely (e.g. Flutter Secure Storage). Send it back as `X-Refresh-Token: <value>` header on refresh calls.

---

### 1.3 Refresh Access Token

Call this when you get a `401` on any protected endpoint.

```
POST /api/auth/refresh
X-Refresh-Token: <your_refresh_token>    ← mobile: send in header
```

**Response 200**
```json
{ "accessToken": "eyJhbGc..." }
```

---

### 1.4 Get Current User

```
GET /api/auth/me
Authorization: Bearer <accessToken>
```

**Response 200**
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "Abhishek" }
}
```

---

### 1.5 Logout

```
POST /api/auth/logout
Authorization: Bearer <accessToken>
```

---

## 2. Market Data — Prices

### 2.1 Single Quote (by symbol)

No auth needed.

```
GET /api/quote?symbol=HDFCBANK&exchange=NSE
```

| Param      | Required | Description                    |
|---|---|---|
| `symbol`   | Yes      | Clean symbol e.g. `HDFCBANK`   |
| `exchange` | No       | `NSE` (default) or `BSE`       |

**Response 200**
```json
{
  "symbol": "HDFCBANK",
  "exchange": "NSE",
  "ltp": 1742.50,
  "open": 1730.00,
  "high": 1755.00,
  "low": 1725.00,
  "close": 1729.00,
  "netChange": 13.50,
  "percentChange": 0.78,
  "volume": 5812000,
  "week52High": 1880.00,
  "week52Low": 1363.00,
  "updatedAt": 1719130200000,
  "source": "live"
}
```

`source` tells you where the data came from: `live` (AngelOne WS, <60s old), `eod` (bhavcopy), `db-live`, `db-eod`, `unavailable`.

---

### 2.2 Batch Quote (multiple symbols)

No auth needed. Best for loading a list screen.

```
GET /api/quotes?symbols=NSE:HDFCBANK,NSE:RELIANCE,BSE:SENSEX
```

`symbols` — comma-separated `EXCHANGE:SYMBOL` pairs. Max ~20 at once.

**Response 200**
```json
{
  "quotes": [
    {
      "symbol": "HDFCBANK", "exchange": "NSE",
      "ltp": 1742.50, "open": 1730.00, "high": 1755.00,
      "low": 1725.00, "close": 1729.00,
      "netChange": 13.50, "percentChange": 0.78,
      "volume": 5812000, "week52High": 1880.00, "week52Low": 1363.00,
      "source": "live", "updatedAt": 1719130200000
    },
    { "symbol": "RELIANCE", "exchange": "NSE", "ltp": 2945.00, ... }
  ]
}
```

---

### 2.3 Batch Quote by Token ID (Flutter watchlist)

No auth needed. Send instrument token IDs (from angle_scrip / search results).

```
GET /api/tokens/ltp?tokens=1333,3045,467,99926000
```

`tokens` — comma-separated AngelOne instrument token IDs.

**Response 200**
```json
{
  "prices": {
    "1333": {
      "ltp": 1742.50,
      "change_pct": 0.78,
      "net_change": 13.50,
      "close": 1729.00,
      "open": 1730.00,
      "high": 1755.00,
      "low":  1725.00,
      "volume": 5812000,
      "token": "1333",
      "source": "live"
    },
    "99926000": { "ltp": 24350.10, "change_pct": 0.32, ... }
  }
}
```

---

### 2.4 Index Prices (NIFTY / SENSEX / BANKNIFTY)

No auth needed. Updated every 60 seconds from AngelOne.

```
GET /api/index-prices
```

**Response 200**
```json
{
  "prices": {
    "NIFTY": {
      "symbol": "NIFTY",
      "ltp": 24350.10,
      "change": 78.45,
      "changePercent": 0.32,
      "open": 24280.00,
      "high": 24400.00,
      "low": 24250.00,
      "close": 24271.65,
      "updatedAt": 1719130200000
    },
    "BANKNIFTY": { ... },
    "SENSEX":    { ... }
  }
}
```

---

### 2.5 Register / Unregister Tokens for Priority Sync

Optional — tells the server to prioritise these tokens in the 60s sync cycle.

```
POST /api/tokens/watch
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "tokens": ["1333", "3045", "467"] }
```

```
POST /api/tokens/unwatch
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "tokens": ["1333"] }
```

Both return `{ "ok": true, "registered": 3 }`.

---

## 3. Live Price Feed (SSE — Real-Time)

### How SSE works on mobile

Server-Sent Events (SSE) is a standard HTTP/1.1 streaming connection. The server keeps the connection open and pushes JSON lines whenever prices change. No packet drops — the TCP connection handles retries. Better than polling because:
- Data is pushed only when something changes (no wasted requests)
- Single long-lived connection (not many short ones)
- Works through nginx with `X-Accel-Buffering: no`

### 3.1 Market Stream (equity / index prices)

```
GET /api/market-stream?symbols=NSE:NIFTY50,NSE:HDFCBANK,BSE:SENSEX
```

No auth needed.

**Stream format** — each message is a JSON array of changed quotes:
```
data: [{"symbol":"HDFCBANK","exchange":"NSE","ltp":1743.20,"netChange":14.20,"changePct":0.82,...}]

data: [{"symbol":"NIFTY50","exchange":"NSE","ltp":24352.80,...}]

: ping
```

- First message is a full snapshot of all requested symbols
- Subsequent messages contain only changed symbols (delta)
- `: ping` comment sent every 15 s to prevent nginx / proxy timeouts

**Flutter / Dart code example:**
```dart
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class PriceFeed {
  final _controller = StreamController<List<dynamic>>.broadcast();
  Stream<List<dynamic>> get stream => _controller.stream;
  http.Client? _client;

  void connect(List<String> symbols) {
    final url = 'https://abhitrade.online/api/market-stream'
        '?symbols=${symbols.join(",")}';
    _client = http.Client();

    _client!
        .send(http.Request('GET', Uri.parse(url)))
        .then((response) {
      response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) {
        if (line.startsWith('data: ')) {
          try {
            final data = jsonDecode(line.substring(6));
            _controller.add(data as List<dynamic>);
          } catch (_) {}
        }
      });
    });
  }

  void dispose() {
    _client?.close();
    _controller.close();
  }
}
```

**React Native / Expo code example:**
```js
import { useEffect, useRef } from 'react';
import EventSource from 'react-native-sse'; // npm install react-native-sse

function usePriceFeed(symbols) {
  const esRef = useRef(null);

  useEffect(() => {
    const url = `https://abhitrade.online/api/market-stream?symbols=${symbols.join(',')}`;
    esRef.current = new EventSource(url);
    esRef.current.onmessage = (e) => {
      const quotes = JSON.parse(e.data);
      // update your state here
    };
    return () => esRef.current?.close();
  }, [symbols.join(',')]);
}
```

---

### 3.2 Option Chain Stream (live OC, SSE)

No auth needed.

```
GET /api/optionchain/stream?symbol=NIFTY&expiry=2026-06-26&strikeCount=15
```

**Stream events:**

| Event name | When | Payload |
|---|---|---|
| `snapshot` | First message + every 30th tick | Full option chain object |
| `delta`    | Every 2s when rows changed | Array of changed rows only |
| `error`    | On data error | `{ "error": "..." }` |

**Flutter example:**
```dart
// Use SSE same as above, but listen for named events:
// "event: snapshot\ndata: {...}\n\n"
// "event: delta\ndata: [...]\n\n"
```

Auto-closes after 2 hours. Reconnect if the connection drops.

---

## 4. Symbol Search

No auth needed.

```
GET /api/search?q=HDFC&exchange=NSE&type=EQ&limit=20
```

| Param      | Required | Description                                      |
|---|---|---|
| `q`        | Yes      | Search query (min 1 char)                        |
| `exchange` | No       | `NSE`, `BSE`, or `all` (default)                |
| `type`     | No       | `EQ`, `INDEX`, `FUT`, `OPT`, or `all` (default) |
| `limit`    | No       | Max results, default 20, max 50                  |

Searches across 162,000+ instruments in `angle_scrip` (AngelOne scrip master). Results include live LTP from last sync.

**Response 200**
```json
{
  "results": [
    {
      "token":          "1333",
      "exchange":       "NSE",
      "symbol":         "HDFCBANK",
      "tradingSymbol":  "HDFCBANK-EQ",
      "name":           "HDFCBANK",
      "instrumentType": "EQ",
      "segment":        "NSE",
      "expiry":         null,
      "strike":         null,
      "optionType":     null,
      "underlying":     null,
      "lotSize":        1,
      "ltp":            1742.50,
      "open":           1730.00,
      "high":           1755.00,
      "low":            1725.00,
      "prevClose":      1729.00,
      "netChange":      13.50,
      "changePct":      0.78,
      "volume":         5812000,
      "priceSource":    "live"
    },
    {
      "token":          "467",
      "exchange":       "NSE",
      "symbol":         "HDFCLIFE",
      "tradingSymbol":  "HDFCLIFE-EQ",
      "instrumentType": "EQ",
      "ltp":            593.80,
      ...
    }
  ],
  "total": 2,
  "source": "postgres"
}
```

**Ordering:** Real NSE/BSE equities appear first, then INDEX, then FUT, then OPT, then bonds/MF.

---

## 5. Option Chain APIs

All option chain endpoints are public (no auth needed).

### 5.1 Get Expiry Dates

Expiry dates are sourced **live from `angle_scrip`** (AngelOne scrip master, 79,000+ active contracts across 222 underlyings). No dates are hardcoded or computed — every expiry you see actually has tradeable contracts in the DB.

```
GET /api/optionchain/expiries?symbol=NIFTY
GET /api/optionchain/expiries?symbol=NIFTY&exchange=NSE
GET /api/optionchain/expiries?symbol=SENSEX&exchange=BSE
GET /api/optionchain/expiries?symbol=HDFCBANK&exchange=NSE
```

| Param      | Required | Description                                                  |
|---|---|---|
| `symbol`   | Yes      | Underlying name — `NIFTY`, `BANKNIFTY`, `HDFCBANK`, etc.   |
| `exchange` | No       | `NSE` → segments NSE+NFO; `BSE` → segments BSE+BFO; omit for both |

**NSE (weekly Thursday expiries + monthly + long-dated)**
```json
{
  "symbol": "NIFTY",
  "exchange": "NSE",
  "expiries": [
    "2026-06-26", "2026-07-03", "2026-07-10", "2026-07-17",
    "2026-07-24", "2026-07-31", "2026-08-27", "2026-09-24",
    "2026-12-31", "2027-03-25", "2027-06-24"
  ],
  "nearest": "2026-06-26"
}
```

**BSE (weekly Wednesday expiries — different schedule from NSE)**
```json
{
  "symbol": "SENSEX",
  "exchange": "BSE",
  "expiries": [
    "2026-06-25", "2026-07-02", "2026-07-09", "2026-07-16",
    "2026-07-23", "2026-07-30"
  ],
  "nearest": "2026-06-25"
}
```

> **Important for mobile:** NSE and BSE expire on **different days of the week**. Always specify `exchange` when building NSE vs BSE option chain screens to get the correct expiry schedule.

---

### 5.2 Get Full Option Chain

Option chain strikes are loaded from `angle_scrip` (same scrip master as expiries). The `expiry` value you pass **must** match one of the dates returned by `/api/optionchain/expiries` — passing an arbitrary date returns a 404.

```
GET /api/optionchain?symbol=NIFTY&expiry=2026-06-26&strikeCount=15
GET /api/optionchain?symbol=SENSEX&expiry=2026-06-25&strikeCount=15
```

| Param        | Required | Description                              |
|---|---|---|
| `symbol`     | Yes      | Underlying: `NIFTY`, `BANKNIFTY`, `RELIANCE`, etc. |
| `expiry`     | Yes      | `YYYY-MM-DD` format                      |
| `strikeCount`| No       | Strikes each side of ATM, default 15, max 50 |
| `fromStrike` | No       | Override — custom range start            |
| `toStrike`   | No       | Override — custom range end              |

**Response 200**
```json
{
  "symbol":    "NIFTY",
  "expiry":    "2026-06-26",
  "spot":      24350.10,
  "atm":       24350,
  "source":    "live",
  "_latencyMs": 8,
  "rows": [
    {
      "strike": 24200,
      "itm": false,
      "atm": false,
      "ce": {
        "token":       "46985",
        "ltp":         310.50,
        "bid":         310.00,
        "ask":         311.00,
        "iv":          14.22,
        "delta":       0.65,
        "gamma":       0.0021,
        "theta":       -5.12,
        "vega":        2.80,
        "oi":          1250000,
        "oiChange":    45000,
        "volume":      82340,
        "netChange":   12.50,
        "percentChange": 4.2
      },
      "pe": {
        "token":       "46986",
        "ltp":         85.20,
        "bid":         84.50,
        "ask":         85.50,
        "iv":          16.80,
        "delta":       -0.35,
        "gamma":       0.0021,
        "theta":       -4.80,
        "vega":        2.80,
        "oi":          980000,
        "oiChange":    -12000,
        "volume":      54200,
        "netChange":   -3.20,
        "percentChange": -3.62
      }
    }
  ]
}
```

`ce` or `pe` can be `null` if no contract exists at that strike.

---

### 5.3 Option Greeks Only

Fetches Delta / Gamma / Theta / Vega / IV from Angel One and caches for 3 minutes.

```
GET /api/optionchain/greeks?symbol=NIFTY&expiry=2026-06-26
```

**Response 200**
```json
{
  "symbol": "NIFTY",
  "expiry": "2026-06-26",
  "source": "live",
  "written": 42,
  "rows": [
    {
      "strike":    24200,
      "optionType": "CE",
      "iv":        14.22,
      "delta":     0.652,
      "gamma":     0.0021,
      "theta":    -5.12,
      "vega":      2.80,
      "volume":    82340
    }
  ]
}
```

---

### 5.4 Single Option Quote

```
GET /api/optionchain/quote?token=46985&exchange=NFO
```

Returns a single contract's real-time FULL quote (depth, OI, IV, greeks).

---

## 6. Order Management APIs

All order endpoints require `Authorization: Bearer <accessToken>`.

### 6.1 Place Order

```
POST /api/orders
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "exchange":        "NSE",
  "symbol":          "HDFCBANK",
  "transaction_type": "BUY",
  "order_type":      "LIMIT",
  "product_type":    "INTRADAY",
  "quantity":        10,
  "price":           1740.00,
  "trigger_price":   null,
  "trading_symbol":  "HDFCBANK-EQ",
  "variety":         "NORMAL",
  "tag":             "mobile-app"
}
```

| Field              | Required | Values / Notes                          |
|---|---|---|
| `exchange`         | Yes      | `NSE`, `BSE`, `NFO`, `BFO`, `MCX`      |
| `symbol`           | Yes      | Clean symbol e.g. `HDFCBANK`           |
| `transaction_type` | Yes      | `BUY` or `SELL`                        |
| `order_type`       | Yes      | `MARKET`, `LIMIT`, `SL`, `SL-M`        |
| `product_type`     | Yes      | `INTRADAY`, `DELIVERY`, `CARRYFORWARD` |
| `quantity`         | Yes      | Number of shares / lots                |
| `price`            | For LIMIT| Limit price                            |
| `trigger_price`    | For SL   | Stoploss trigger price                 |
| `trading_symbol`   | No       | Full trading symbol (e.g. `HDFCBANK-EQ`) |
| `variety`          | No       | `NORMAL` (default), `AMO`, `BO`, `CO`  |
| `tag`              | No       | Free text tag for your reference       |

**Response 201**
```json
{
  "order": {
    "id":               "uuid",
    "symbol":           "HDFCBANK",
    "exchange":         "NSE",
    "transaction_type": "BUY",
    "order_type":       "LIMIT",
    "product_type":     "INTRADAY",
    "quantity":         10,
    "price":            1740.00,
    "status":           "pending",
    "filled_quantity":  0,
    "placed_at":        "2026-06-23T09:15:00Z"
  }
}
```

> **Note:** This stores the order in the AbhiTrade database. To actually execute on the broker, use `/api/angel-one/place-order` (see section 10).

---

### 6.2 List Orders

```
GET /api/orders?status=pending&limit=50&offset=0
Authorization: Bearer <accessToken>
```

| Param    | Description                                      |
|---|---|
| `status` | Filter by `pending`, `open`, `complete`, `cancelled`, `rejected` |
| `limit`  | Default 50, max 200                              |
| `offset` | For pagination                                   |

**Response 200**
```json
{
  "orders": [
    {
      "id":               "uuid",
      "symbol":           "HDFCBANK",
      "exchange":         "NSE",
      "transaction_type": "BUY",
      "order_type":       "LIMIT",
      "product_type":     "INTRADAY",
      "quantity":         10,
      "price":            1740.00,
      "trigger_price":    null,
      "status":           "complete",
      "filled_quantity":  10,
      "average_price":    1739.50,
      "placed_at":        "2026-06-23T09:15:00Z"
    }
  ]
}
```

---

### 6.3 Modify Order

```
PATCH /api/orders/{orderId}
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "price":          1745.00,
  "quantity":       15,
  "trigger_price":  null
}
```

Only `pending` / `open` orders can be modified.

**Response 200** — returns updated order object.

---

### 6.4 Cancel Order

```
DELETE /api/orders/{orderId}
Authorization: Bearer <accessToken>
```

Only `pending` / `open` orders can be cancelled.

**Response 200**
```json
{
  "order": { "id": "uuid", "status": "cancelled", ... }
}
```

**Error 404** — order not found or already in terminal state (`complete`, `cancelled`, `rejected`).

---

## 7. Positions

```
GET /api/positions?date=2026-06-23
Authorization: Bearer <accessToken>
```

`date` is optional — defaults to today.

**Response 200**
```json
{
  "positions": [
    {
      "id":            "uuid",
      "symbol":        "HDFCBANK",
      "exchange":      "NSE",
      "product_type":  "INTRADAY",
      "quantity":      10,
      "buy_quantity":  10,
      "sell_quantity": 0,
      "average_price": 1739.50,
      "last_price":    1743.20,
      "realized_pnl":  0,
      "trade_date":    "2026-06-23"
    }
  ]
}
```

---

## 8. Holdings

```
GET /api/holdings
Authorization: Bearer <accessToken>
```

**Response 200**
```json
{
  "holdings": [
    {
      "id":            "uuid",
      "symbol":        "RELIANCE",
      "exchange":      "NSE",
      "quantity":      5,
      "average_price": 2850.00,
      "isin":          "INE002A01018"
    }
  ]
}
```

---

## 9. Watchlists

### 9.1 Get all watchlists

```
GET /api/watchlists
Authorization: Bearer <accessToken>
```

**Response 200**
```json
{
  "watchlists": [
    { "id": "uuid", "name": "My Watchlist", "sort_order": 0, "created_at": "..." }
  ]
}
```

### 9.2 Create watchlist

```
POST /api/watchlists
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "name": "Options Watchlist" }
```

### 9.3 Get watchlist items

```
GET /api/watchlists/{watchlistId}/items
Authorization: Bearer <accessToken>
```

**Response 200**
```json
{
  "items": [
    {
      "id":              "uuid",
      "watchlist_id":    "uuid",
      "token":           "1333",
      "exchange":        "NSE",
      "symbol":          "HDFCBANK",
      "trading_symbol":  "HDFCBANK-EQ",
      "instrument_type": "EQ",
      "sort_order":      0,
      "added_at":        "2026-06-23T08:00:00Z"
    }
  ]
}
```

### 9.4 Add item to watchlist

```
POST /api/watchlists/{watchlistId}/items
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "token":           "1333",
  "exchange":        "NSE",
  "symbol":          "HDFCBANK",
  "trading_symbol":  "HDFCBANK-EQ",
  "instrument_type": "EQ"
}
```

### 9.5 Remove item from watchlist

```
DELETE /api/watchlists/{watchlistId}/items/{itemId}
Authorization: Bearer <accessToken>
```

---

## 10. Angel One Direct Broker APIs

These proxy directly to Angel One SmartAPI. They require the user's own Angel One `accessToken` and `apiKey` in the request body (not the AbhiTrade JWT).

> Use these for **real broker order execution**. The `/api/orders` endpoints in section 6 are for AbhiTrade's own paper/tracking system.

### 10.1 Place Order on Angel One Broker

```
POST /api/angel-one/place-order
Content-Type: application/json

{
  "apiKey":      "your_angel_one_api_key",
  "accessToken": "angel_one_jwt_token",
  "order": {
    "variety":         "NORMAL",
    "tradingsymbol":   "SBIN-EQ",
    "symboltoken":     "3045",
    "transactiontype": "BUY",
    "exchange":        "NSE",
    "ordertype":       "MARKET",
    "producttype":     "INTRADAY",
    "duration":        "DAY",
    "price":           "0",
    "squareoff":       "0",
    "stoploss":        "0",
    "quantity":        "1"
  }
}
```

**Response 200**
```json
{ "orderId": "230623000012345", "message": "SUCCESS" }
```

### 10.2 Get Order Book from Angel One

```
POST /api/angel-one/orderbook
Content-Type: application/json

{ "apiKey": "...", "accessToken": "..." }
```

### 10.3 Get Positions from Angel One

```
POST /api/angel-one/positions
Content-Type: application/json

{ "apiKey": "...", "accessToken": "..." }
```

### 10.4 Get Portfolio / Holdings from Angel One

```
POST /api/angel-one/portfolio
Content-Type: application/json

{ "apiKey": "...", "accessToken": "..." }
```

### 10.5 Get LTP from Angel One

```
POST /api/angel-one/ltp
Content-Type: application/json

{
  "apiKey":      "...",
  "accessToken": "...",
  "exchange":    "NSE",
  "token":       "1333",
  "symbol":      "HDFCBANK-EQ"
}
```

### 10.6 Get Margin

```
POST /api/angel-one/margin
Content-Type: application/json

{
  "apiKey":      "...",
  "accessToken": "...",
  "positions": [
    { "exchange": "NSE", "qty": 1, "price": 1740, "productType": "INTRADAY",
      "token": "1333", "tradeType": "BUY" }
  ]
}
```

### 10.7 Get Quote (FULL mode with depth)

```
POST /api/angel-one/quotes
Content-Type: application/json

{
  "apiKey":         "...",
  "accessToken":    "...",
  "mode":           "FULL",
  "exchangeTokens": { "NSE": ["1333", "3045"] }
}
```

### 10.8 Historical Candles

```
POST /api/angel-one/candles
Content-Type: application/json

{
  "apiKey":      "...",
  "accessToken": "...",
  "exchange":    "NSE",
  "symboltoken": "1333",
  "interval":    "ONE_MINUTE",
  "fromdate":    "2026-06-23 09:15",
  "todate":      "2026-06-23 15:30"
}
```

`interval` values: `ONE_MINUTE`, `THREE_MINUTE`, `FIVE_MINUTE`, `TEN_MINUTE`, `FIFTEEN_MINUTE`, `THIRTY_MINUTE`, `ONE_HOUR`, `ONE_DAY`

---

## 11. Alerts

All endpoints require auth.

### 11.1 Create Alert

```
POST /api/alerts
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "exchange":     "NSE",
  "symbol":       "HDFCBANK",
  "token":        "1333",
  "condition":    "above",
  "target_value": 1800.00,
  "message":      "HDFCBANK crossed 1800"
}
```

`condition` values: `above`, `below`, `percent_up`, `percent_down`

### 11.2 Get Alerts

```
GET /api/alerts?status=active
Authorization: Bearer <accessToken>
```

### 11.3 Update / Delete Alert

```
PATCH /api/alerts/{alertId}
DELETE /api/alerts/{alertId}
```

---

## 12. Instrument Lookup

### 12.1 Get Instrument by Token

```
GET /api/instruments/{token}?exchange=NSE
```

Returns full scrip details for a given token.

### 12.2 Get Market Gainers / Losers

No auth needed.

```
GET /api/gainers-losers?type=gainers
GET /api/gainers-losers?type=losers
GET /api/gainers-losers?type=oi-gainers
GET /api/gainers-losers?type=oi-losers
```

### 12.3 Market Movers

```
GET /api/market-movers
```

Returns top gainers, losers, volume shockers, 52W highs/lows.

---

## 13. Health Check

No auth needed.

```
GET /api/health
```

**Response 200**
```json
{
  "status": "ok",
  "redis": "connected",
  "postgres": "connected",
  "timestamp": "2026-06-23T09:15:00Z"
}
```

---

## 14. Complete Flutter Integration Example

### Step 1: HTTP Client Setup

```dart
// lib/services/api_client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const baseUrl = 'https://abhitrade.online/api';
  static final _storage = FlutterSecureStorage();
  static String? _accessToken;

  static Future<String?> _getAccessToken() async {
    return _accessToken ??= await _storage.read(key: 'access_token');
  }

  static Future<Map<String, String>> _headers({bool auth = true}) async {
    final h = {'Content-Type': 'application/json'};
    if (auth) {
      final token = await _getAccessToken();
      if (token != null) h['Authorization'] = 'Bearer $token';
    }
    return h;
  }

  static Future<Map<String, dynamic>> get(
    String path, {
    Map<String, String>? params,
    bool auth = false,
  }) async {
    var uri = Uri.parse('$baseUrl$path');
    if (params != null) uri = uri.replace(queryParameters: params);
    final resp = await http.get(uri, headers: await _headers(auth: auth));
    return _handle(resp);
  }

  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    bool auth = true,
  }) async {
    final resp = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(auth: auth),
      body: jsonEncode(body),
    );
    return _handle(resp);
  }

  static Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body,
  ) async {
    final resp = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _handle(resp);
  }

  static Future<void> delete(String path) async {
    final resp = await http.delete(
      Uri.parse('$baseUrl$path'),
      headers: await _headers(),
    );
    _handle(resp);
  }

  static Map<String, dynamic> _handle(http.Response resp) {
    final data = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) throw ApiException(data['error'] ?? 'Error', resp.statusCode);
    return data;
  }

  // Store tokens after login
  static Future<void> saveTokens(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    await _storage.write(key: 'access_token', value: accessToken);
    await _storage.write(key: 'refresh_token', value: refreshToken);
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override String toString() => 'ApiException($statusCode): $message';
}
```

### Step 2: Auth Service

```dart
// lib/services/auth_service.dart
class AuthService {
  static Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await ApiClient.post('/auth/login', {
      'email': email, 'password': password,
    }, auth: false);
    final accessToken = data['accessToken'] as String;
    // store token (refresh token comes as cookie, handle via response headers if needed)
    await ApiClient.saveTokens(accessToken, '');
    return data['user'] as Map<String, dynamic>;
  }
}
```

### Step 3: Price Feed Service (SSE)

```dart
// lib/services/price_feed.dart
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class PriceFeed {
  static const _base = 'https://abhitrade.online/api';
  final _controller = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get stream => _controller.stream;
  http.Client? _client;
  Timer? _reconnectTimer;

  void connect(List<String> symbols) {
    _client?.close();
    final url = '$_base/market-stream?symbols=${symbols.join(",")}';

    http.get(Uri.parse(url)).then((_) {}); // won't work for streaming — use below:

    // Use http streaming
    final request = http.Request('GET', Uri.parse(url));
    _client = http.Client();
    _client!.send(request).then((response) {
      response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
        (line) {
          if (line.startsWith('data: ') && line.length > 6) {
            try {
              final updates = jsonDecode(line.substring(6)) as List<dynamic>;
              for (final q in updates) {
                _controller.add(q as Map<String, dynamic>);
              }
            } catch (_) {}
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: false,
      );
    });
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    // reconnect after 3s on disconnect
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      // caller should call connect() again with same symbols
    });
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _client?.close();
    _controller.close();
  }
}
```

### Step 4: Order Service

```dart
// lib/services/order_service.dart
class OrderService {
  static Future<Map<String, dynamic>> placeOrder({
    required String exchange,
    required String symbol,
    required String transactionType, // BUY or SELL
    required String orderType,       // MARKET, LIMIT, SL, SL-M
    required String productType,     // INTRADAY, DELIVERY, CARRYFORWARD
    required int quantity,
    double? price,
    double? triggerPrice,
    String? tradingSymbol,
  }) async {
    return await ApiClient.post('/orders', {
      'exchange':         exchange,
      'symbol':           symbol,
      'transaction_type': transactionType,
      'order_type':       orderType,
      'product_type':     productType,
      'quantity':         quantity,
      if (price != null)        'price':         price,
      if (triggerPrice != null) 'trigger_price': triggerPrice,
      if (tradingSymbol != null) 'trading_symbol': tradingSymbol,
    });
  }

  static Future<List<dynamic>> getOrders({String? status}) async {
    final data = await ApiClient.get('/orders',
        params: status != null ? {'status': status} : null, auth: true);
    return data['orders'] as List<dynamic>;
  }

  static Future<Map<String, dynamic>> modifyOrder(
    String orderId, {
    double? price,
    int? quantity,
    double? triggerPrice,
  }) async {
    return await ApiClient.patch('/orders/$orderId', {
      if (price != null)        'price':         price,
      if (quantity != null)     'quantity':      quantity,
      if (triggerPrice != null) 'trigger_price': triggerPrice,
    });
  }

  static Future<void> cancelOrder(String orderId) async {
    await ApiClient.delete('/orders/$orderId');
  }
}
```

---

## 15. Error Codes Reference

| HTTP Status | Meaning                                      |
|---|---|
| `200`       | Success                                      |
| `201`       | Created (new resource)                       |
| `400`       | Bad request — missing or invalid parameters  |
| `401`       | Unauthorized — missing or expired token      |
| `404`       | Not found                                    |
| `409`       | Conflict — e.g. duplicate watchlist item     |
| `500`       | Internal server error                        |
| `503`       | Service unavailable — DB or Redis down       |

All error responses have the shape: `{ "error": "Human-readable message" }`

---

## 16. Rate Limits

The nginx layer enforces these limits (applies to all clients, including mobile):

| Zone       | Limit        | Applies to              |
|---|---|---|
| `api`      | 30 req/s     | All `/api/*` routes     |
| `search`   | 10 req/s     | `/api/search`           |
| `upload`   | 2 req/s      | `/api/bhavcopy/upload`  |

On limit hit: HTTP 503. Mobile should implement exponential backoff.

---

## 17. Tips for Mobile Integration

1. **Token refresh flow** — wrap all API calls in a try/catch. On 401, call `/api/auth/refresh`, update stored token, retry the original request once.

2. **SSE reconnect** — SSE streams auto-close after 2 hours. Implement auto-reconnect on stream end or error with 3s backoff.

3. **Heartbeat** — the server sends `: ping` comments every 15s. Use this as a liveness check — if you don't receive any event for 30s, reconnect.

4. **Token-based price feed** — for a watchlist of 20 symbols, use `/api/market-stream?symbols=NSE:SYM1,NSE:SYM2,...`. For token-based lookup (when you have instrument token IDs), use `/api/tokens/ltp?tokens=1333,3045,...` with a polling interval of 2–3s.

5. **Search UX** — debounce search input by 300ms before calling `/api/search`. Cache results locally for 60s to avoid re-fetching identical queries.

6. **Option chain polling** — if SSE is too complex, poll `/api/optionchain` every 3–5s. The API is cached in Redis for 5s so it responds in <10ms.
