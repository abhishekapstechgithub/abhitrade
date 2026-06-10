# TradeKaro

Production-grade Indian stock trading web app — equities, F&O, options, watchlist, security master upload, and Redis-backed contract search.

## Quick Start

```bash
# Install dependencies
npm install

# Start Redis (Docker)
docker compose up -d redis

# Pre-load all 4 CSV files into Redis (edit paths in scripts/bulk-load.mjs if needed)
npm run load-contracts

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

| Module | Description |
|---|---|
| **Dashboard** | Market overview, portfolio snapshot, watchlist, mini option chain |
| **Markets** | Option chain, charts, stock composition heatmap, saved strategies |
| **Watchlist** | Multi-watchlist, drag-drop, sort/filter, quick buy/sell |
| **Portfolio** | Holdings, grouped holdings, P&L tracking |
| **Orders** | Full order management — active, history, GTT, basket |
| **Positions** | Net/intraday positions, square off, hedge |
| **Tools** | Option chain, strategy builder, calculators, screener, alerts |
| **Profile** | KYC, bank details, security settings, notifications |
| **Security Master** | Upload NSE/BSE files → Redis-backed contract search |

## Security Master & Redis Contract Search

### Supported File Formats

| Format | Filename pattern | Rows (typical) |
|---|---|---|
| NSE Cash Market | `NSE_CM_security_*.csv` | ~33k |
| NSE F&O | `NSE_FO_contract_*.csv` | ~87k |
| BSE F&O | `BSE_EQD_CONTRACT_*.csv` | ~41k |
| BSE Equity | `BSE_EQ_SCRIP_*.csv` | ~17k |

Format is auto-detected from filename or column headers.

### Option A — CLI Bulk Load (fastest)

```bash
# Edit the DEFAULT_FILES list at the top of scripts/bulk-load.mjs, then:
node scripts/bulk-load.mjs

# Or pass files explicitly:
node scripts/bulk-load.mjs /path/to/NSE_CM.csv /path/to/NSE_FO.csv
```

### Option B — UI Upload

1. Navigate to `/security-master`
2. Drag-and-drop a CSV file from NSE or BSE
3. Click **Upload & Import**
4. Watch the live progress bar as records load into Redis
5. Use the **Live Search Test** sidebar to verify search works

### Docker (full stack)

```bash
docker compose up --build
```

This starts Redis, runs the bulk loader against the 4 CSV files, then starts the Next.js app. The `loader` service in docker-compose.yml handles the pre-load automatically.

### Redis Key Schema

```
tk:auto                       ZSET  — lexicographic autocomplete (all entries scored 0)
tk:instr:{exchange}:{token}   HASH  — full instrument details
tk:sym:{exchange}:{SYMBOL}    SET   — tokens for a given underlying symbol
tk:job:{uuid}                 HASH  — upload job progress/status (TTL 24h)
```

**Autocomplete entry format** (member of `tk:auto`):
```
{TRADINGSYMBOL}|{token}|{exchange}|{type}|{underlying}|{expiry}|{strike}|{optType}|{name}
```

### Search API

```
GET /api/search?q=RELIANCE              # prefix search
GET /api/search?q=NIFTY&exchange=NSE    # filter by exchange
GET /api/search?q=BANK&type=FO          # filter by instrument type
GET /api/search?q=NIFTY&limit=10        # limit results (max 50)
```

Returns `{ results, total, source }` where `source` is `"redis"` (real data) or `"mock"` (fallback).

### Other APIs

```
GET  /api/redis-stats                   # index size, availability
POST /api/upload                        # multipart upload (field: "file")
GET  /api/upload/status/{jobId}         # poll job progress
GET  /api/health                        # service health check
```

## Development Commands

```bash
npm run dev              # Dev server on :3000
npm run build            # Production build
npm run lint             # ESLint
npm run load-contracts   # Bulk-load all 4 CSV files into Redis
npx tsc --noEmit         # Type check only

docker compose up -d            # Start Redis only
docker compose up --build       # Start Redis + app + loader
docker compose down             # Stop all services
```

## Column Mapping

The parsers handle the abbreviated column names NSE/BSE use:

| CSV Column | Maps to |
|---|---|
| `FinInstrmId` | Instrument token |
| `TckrSymb` | Symbol / underlying |
| `FinInstrmNm` | Instrument type code (OPTIDX, FUTSTK…) |
| `XpryDt` | Expiry (Unix ts for NSE, "DD-Mon-YY" for BSE) |
| `StrkPric` | Strike price in paise → divided by 100 to get ₹ |
| `OptnTp` | CE / PE |
| `MinLot` | Lot size |
| `ISIN` | ISIN code (equities) |
| `SctySrs` | Series (EQ, BE, etc.) |

## Environment Variables

Copy `.env.local.example` → `.env.local`:

```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # leave empty if no auth
NEXT_PUBLIC_API_URL=http://localhost:3000/api
JWT_SECRET=your-secret-key
UPLOAD_DIR=/tmp/tradekaro-uploads
```

## Tech Stack

- **Next.js 14** (App Router, Node 18+)
- **Tailwind CSS**
- **Zustand** (state management)
- **Lucide React** (icons)
- **ioredis** (Redis client)
- **csv-parse** (CSV parsing)
- **Redis 7** (contract search cache, `ZRANGEBYLEX` autocomplete)
- **Docker Compose** (Redis + loader + app containers)
