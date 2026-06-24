# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Status

The project is **scaffolded and running** as a **monorepo** with three parts:
- `frontend/` — Pure Next.js UI (no API routes)
- `backend/api/` — Express.js REST API server (migrated from Next.js app/api/)
- `backend/strategy-api/` — FastAPI Python service for strategies/backtests
- `flutter_mobile/` — Flutter mobile app

All major pages, components, API routes, Docker services, and data stores are implemented.

---

## Monorepo Structure

```
/
├── frontend/              ← Next.js App Router (UI only, no API routes)
├── backend/
│   ├── api/               ← Express.js server (port 3001)
│   └── strategy-api/      ← FastAPI Python server (port 8000)
├── flutter_mobile/        ← Flutter mobile app
├── docker-compose.yml     ← Orchestrates all services
├── nginx/                 ← Reverse proxy config
├── certbot/               ← SSL certs
├── scripts/               ← DB migrations, init scripts
├── Bhavcopy/              ← NSE bhavcopy CSV data
└── .env.local             ← Root env vars for docker-compose
```

---

## Tech Stack (Decided)

| Layer | Choice |
|---|---|
| Frontend framework | Next.js (App Router) — UI only |
| Backend API | Express.js (standalone, port 3001) |
| Strategy API | FastAPI (Python, port 8000) |
| Mobile | Flutter |
| Styling | Tailwind CSS |
| State management | Zustand |
| Charting | ApexCharts (lightweight, React-friendly) |
| Auth | JWT with refresh tokens (cookies) |
| File uploads | Multipart via Express + multer |
| Cache / search index | Redis (Dockerized) |
| Worker | Node.js background job (backend/api/workers/) |
| Container orchestration | Docker Compose |

---

## Development Commands

### Frontend (Next.js UI)

```bash
cd frontend

# Install dependencies
npm install

# Start dev server — proxies /api/* to http://localhost:3001
cp .env.local.example .env.local
npm run dev

# Build for production
npm run build

# Type-check
npx tsc --noEmit
```

Frontend runs on `http://localhost:3000`. All `/api/*` requests are proxied to the Express backend (configured in `next.config.mjs` rewrites).

### Backend API (Express)

```bash
cd backend/api

# Install dependencies
npm install

# Start dev server (hot reload via tsx watch)
npm run dev

# Start production
npm run start
```

Backend runs on `http://localhost:3001`. All REST API routes are here.

### Strategy API (FastAPI)

```bash
cd backend/strategy-api

# Create virtual env and install deps
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start server
uvicorn main:app --reload --port 8000
```

---

## Docker Workflow

> **Note:** This project uses `docker-compose` (v1 standalone binary).  
> The newer `docker compose` plugin (v2) is **not** available in this WSL2 environment.  
> Always use `docker-compose` (hyphenated) for all commands.

### Traffic flow (production)

```
Internet
   │
   ▼
Nginx :80/:443   (SSL termination, rate limiting, static cache headers)
   │
   ▼ proxy_pass http://app:3000 (internal Docker network only)
   │
   ▼
Next.js app      (not exposed on host — only reachable via nginx)
   │
   ├──▶ Redis :6379   (internal)
   └──▶ Postgres :5432 (internal)
```

### Services started by Docker Compose

| Container | Image | Host Port | Purpose |
|---|---|---|---|
| `abhitrade-nginx` | nginx:1.27-alpine | **80, 443** | Reverse proxy + SSL termination |
| `abhitrade-app` | Dockerfile / Hub | internal only | Next.js app (no direct host access) |
| `abhitrade-postgres` | postgres:16-alpine | 5432 | PostgreSQL |
| `abhitrade-redis` | redis:7-alpine | 6379 | Cache + search index |
| `abhitrade-certbot` | certbot/certbot | — | Auto-renews Let's Encrypt cert every 12h |
| `abhitrade-loader` | Dockerfile.loader | — | One-shot CSV loader |

### Web container design (web-only)

The dev app container (`Dockerfile.dev`) is intentionally web-only:
- Only `app/`, `components/`, `lib/`, `store/`, `types/`, `hooks/`, `public/`, and config files are bind-mounted in
- `scripts/`, `workers/`, `mobile_app/` are **never** mounted or visible inside the container
- The image itself only contains `node_modules` (npm-installed deps); source comes from bind mounts
- Rebuild is only needed when `package.json` or `package-lock.json` changes

### Loader container design (minimal)

`Dockerfile.loader` installs only 3 packages (`csv-parse`, `ioredis`, `pg`) — no full `npm ci` of all 537MB of node_modules.

---

## Nginx + SSL (Let's Encrypt)

### Config files

| File | Purpose |
|---|---|
| `nginx/nginx.conf` | Worker tuning, gzip, rate limit zones, buffer sizes |
| `nginx/conf.d/abhitrade.conf` | HTTP→HTTPS redirect, HTTPS vhost, proxy rules, security headers |
| `scripts/ssl-init.sh` | One-time SSL setup script (run on first deploy) |

### First-time SSL setup (run once on your server)

> Prerequisites: DNS A record for `abhitrade.online` and `www.abhitrade.online` must point to your server IP, and ports 80 + 443 must be open in the firewall.

```bash
# 1. Clone the repo on your server
git clone <repo-url> && cd TradeKaro

# 2. Copy and set secrets
cp .env.local.example .env.local
# Edit: set JWT_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD

# 3. Start all services
docker-compose up -d --build          # production build
# OR
docker-compose -f docker-compose.hub.yml up -d   # hub pull

# 4. Run the one-time SSL setup (gets Let's Encrypt cert)
bash scripts/ssl-init.sh
# For hub deployment:
bash scripts/ssl-init.sh docker-compose.hub.yml
```

The script does five things automatically:
1. Creates a temporary self-signed cert (so nginx can start)
2. Starts nginx
3. Runs Certbot (webroot method — no port conflicts)
4. Replaces the dummy cert with the real Let's Encrypt cert
5. Reloads nginx

**After this, Certbot auto-renews every 12 hours** via the `certbot` container. No cron job needed.

### Firewall rules required (on your server)

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Manual cert renewal (if needed)

```bash
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload
```

### Check cert expiry

```bash
docker-compose run --rm certbot certificates
```

### Where certs are stored

```
certbot/conf/live/abhitrade.online/
├── fullchain.pem   ← nginx ssl_certificate
├── privkey.pem     ← nginx ssl_certificate_key
└── chain.pem       ← nginx ssl_trusted_certificate (for OCSP stapling)
```

These directories are in `.gitignore` — **never commit SSL private keys**.

---

## Docker Hub Images

Both custom images are published to Docker Hub under `abhishekdevopstech`:

| Image | Tag | Purpose |
|---|---|---|
| `abhishekdevopstech/tradekaro-app` | `:prod` | **Production** — `next build` baked in, used by `docker-compose.hub.yml` |
| `abhishekdevopstech/tradekaro-app` | `:latest` | Dev image (bind-mount source at runtime) — local dev only |
| `abhishekdevopstech/tradekaro-loader` | `:latest` | Security master CSV loader |

> **Important:** Always push `:prod` for server deployments. The `:latest` tag is the dev image — it has no source code baked in and will crash on a server without bind mounts.

Postgres and Redis are **not** pushed — they use the official `postgres:16-alpine` and `redis:7-alpine` images directly.

### Deploy on any machine (no source code needed)

Use `docker-compose.hub.yml` which pulls the `:prod` image:

```bash
# Pull latest images and start (only needs the repo for init scripts + schema)
docker-compose -f docker-compose.hub.yml up -d

# Pull latest image versions without restarting
docker-compose -f docker-compose.hub.yml pull

# Stop
docker-compose -f docker-compose.hub.yml down

# Full reset (wipes DB + Redis volumes)
docker-compose -f docker-compose.hub.yml down -v
```

### Re-push images after code changes

```bash
# 1. Build and push the PRODUCTION image (used by docker-compose.hub.yml)
docker-compose -f docker-compose.yml build app
docker tag tradekaro_app:latest abhishekdevopstech/tradekaro-app:prod
docker push abhishekdevopstech/tradekaro-app:prod

# 2. Build and push the loader
docker tag tradekaro_loader:latest abhishekdevopstech/tradekaro-loader:latest
docker push abhishekdevopstech/tradekaro-loader:latest

# (Optional) Also update the :latest dev image
docker tag tradekaro_app:latest abhishekdevopstech/tradekaro-app:latest
docker push abhishekdevopstech/tradekaro-app:latest
```

### Start (dev mode — hot reload, source bind-mounted)

```bash
# Builds images if needed, starts all services in background
docker-compose up -d --build

# Follow live logs from all services
docker-compose logs -f

# Follow logs for a specific service only
docker-compose logs -f app
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Start (production mode — no hot reload, standalone Next.js build)

```bash
docker-compose -f docker-compose.yml up -d --build
```

### Stop / restart

```bash
# Stop all services (keeps volumes)
docker-compose down

# Stop and wipe all volumes (full reset — loses DB data + Redis data)
docker-compose down -v

# Restart a single service
docker-compose restart app

# Rebuild and restart a single service
docker-compose up -d --build app
```

### Security master CSV loader

```bash
# Run the one-shot loader (loads CSV files into Redis + Postgres)
docker-compose run --rm loader

# Force re-import (overwrite existing data)
docker-compose run --rm loader --force
```

### Useful inspection commands

```bash
# Check running containers and their health status
docker-compose ps

# Exec into the app container
docker-compose exec app sh

# Exec into postgres and open psql for the live DB
docker-compose exec postgres psql -U tradekaro -d abhitrade_live

# Exec into redis and open redis-cli
docker-compose exec redis redis-cli
```

### First-time setup checklist

1. Copy environment file and set secrets:
   ```bash
   cp .env.local.example .env.local
   # Edit JWT_SECRET and any other values
   ```
2. Start all services:
   ```bash
   docker-compose up -d --build
   ```
3. Watch logs until the app is healthy (look for `ready` from Next.js):
   ```bash
   docker-compose logs -f app
   ```
4. Open `http://localhost:3000` in your browser.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `unknown shorthand flag: 'd'` error | Use `docker-compose` (hyphen), not `docker compose` |
| App container unhealthy | Check `docker-compose logs app`; Postgres/Redis may still be starting |
| Port 3000 already in use | Stop the local `npm run dev` process first |
| DB schema not applied | Schema is auto-applied by `scripts/init-databases.sh` on first Postgres start; `docker-compose down -v && docker-compose up -d --build` to reset |
| Redis data lost | Normal after `docker-compose down -v`; re-run loader to repopulate |

---

## Project Structure (Target)

```
abhitrade/                      ← monorepo root
├── frontend/                   ← Next.js App Router (UI only)
│   ├── app/                    # Pages (no app/api/ — all routes are in backend)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── markets/
│   │   ├── watchlist/
│   │   ├── portfolio/
│   │   ├── orders/
│   │   ├── positions/
│   │   ├── tools/
│   │   ├── profile/
│   │   └── security-master/
│   ├── components/             # UI components
│   ├── store/                  # Zustand stores
│   ├── hooks/
│   ├── types/
│   ├── public/
│   ├── package.json            # UI-only deps (next, react, zustand, charts, tailwind)
│   ├── next.config.mjs         # Rewrites /api/* → Express backend
│   └── .env.local.example
│
├── backend/
│   ├── api/                    ← Express.js REST API server (port 3001)
│   │   ├── server.ts           # Entry point
│   │   ├── routes/             # One file per feature group
│   │   │   ├── index.ts        # Registers all routers
│   │   │   ├── auth.ts
│   │   │   ├── angelone.ts
│   │   │   ├── watchlists.ts
│   │   │   ├── orders.ts
│   │   │   ├── portfolio.ts
│   │   │   ├── alerts.ts
│   │   │   ├── optionchain.ts
│   │   │   ├── market.ts       # market-stream (SSE), market-sync, movers
│   │   │   ├── quotes.ts       # quote, quotes, tokens, scrips, search
│   │   │   ├── bhavcopy.ts
│   │   │   ├── upload.ts
│   │   │   ├── chart.ts
│   │   │   └── system.ts       # health, redis-stats
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── cors.ts
│   │   ├── lib/                # Shared server libs (db, redis, auth, utils)
│   │   ├── workers/            # Security master CSV loader
│   │   ├── package.json        # Server-only deps (express, pg, ioredis, multer, …)
│   │   └── Dockerfile
│   │
│   └── strategy-api/           ← FastAPI Python (port 8000)
│       ├── main.py
│       ├── requirements.txt
│       └── Dockerfile
│
├── flutter_mobile/             ← Flutter mobile app
├── docker-compose.yml
├── nginx/
├── scripts/                    # DB migrations, init scripts
├── Bhavcopy/
└── .env.local
```

---

## Key Architecture Notes

### Search Flow
Global search bar (`Ctrl+S`) queries Redis first via `/api/search?q=`. Redis holds security master records loaded by the worker. On miss, falls back to the in-memory mock dataset. Results show symbol, exchange, instrument type with quick-open actions (chart / order / option chain).

### Security Master Upload Flow
Upload page (`/security-master`) accepts CSV/TXT/ZIP. The frontend posts to `/api/upload` which nginx proxies to the Express backend. The `backend/api/routes/upload.ts` handler receives the file via multer, then spawns the worker (`backend/api/workers/load-security-master.ts`) which parses rows, validates, deduplicates, and bulk-writes into Redis using the key schema below.

### Redis Key Schema
```
instrument:{token}          → hash of all fields (symbol, expiry, strike, type, lot size, etc.)
idx:symbol:{SYMBOL}         → set of tokens matching that symbol
idx:prefix:{ABC}            → sorted set for autocomplete prefix search
idx:expiry:{YYYY-MM-DD}     → set of tokens expiring on that date
search:recent:{userId}      → list of recent search terms
```

### Color Conventions
- Gains / positive P&L: `text-green-600` / `#16a34a`
- Losses / negative P&L: `text-red-600` / `#dc2626`
- Primary accent (buttons, highlights): `text-blue-600` / `#2563eb`
- Background: white; borders: `gray-200`; surface shadows: `shadow-sm`

---

## Data Models (`types/`)

Define TypeScript interfaces for:
`User`, `Watchlist`, `WatchlistItem`, `Portfolio`, `Holding`, `GroupHolding`, `Order`, `OrderHistory`, `Position`, `Trade`, `MarketIndex`, `OptionContract`, `SecurityMasterRecord`, `UploadJob`, `RedisSearchIndex`, `SavedStrategy`, `Alert`, `Notification`

---

## Environment Variables

```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
NEXT_PUBLIC_API_URL=http://localhost:3000/api
JWT_SECRET=
UPLOAD_DIR=/tmp/tradekaro-uploads
```

---

## Docker Compose Services

Minimum services:
- `redis` — official Redis 7 Alpine image, port 6379
- `app` (optional) — Next.js container for production

---

# Product Specification

> Everything below is the product requirements spec. All features listed here must be implemented.

---

You are building a production-grade Indian stock trading web app called "TradeKaro". The app should feel like a premium, modern brokerage platform inspired by the layout and workflow of advanced broker web apps, especially an options-first dashboard. Do not copy any copyrighted logo, text, or proprietary assets; instead create an original UI with a very similar structure, density, and usability.

The app must be built as a responsive web application with a desktop-first layout and tablet support. The UI should be optimized for active traders who want to search instruments, view option chains, analyze charts, manage watchlists, place orders, monitor positions, and upload exchange security master files.

Use a clean white background, soft gray borders, subtle shadows, blue primary highlights, green for gains, red for losses, and a highly readable trading dashboard style.

## Product Vision
Create a single-page trading workspace where the user can:
- Search and discover equities, indices, options, and contracts.
- Open option chain, charts, stock composition, and favourite strategies from the Markets menu.
- Manage a rich watchlist with multiple watchlist tools and filters.
- View portfolio, holdings, grouped holdings, P&L, and asset allocation.
- Track orders, trades, positions, margins, and activity.
- Use tools for options analysis, screening, strategy building, and charting.
- Upload NSE/BSE security master files into Redis-backed storage and search them from the dashboard.
- Quickly access all major actions without leaving the screen.

---

# 1) Overall Layout

## Top Sticky Header
Build a sticky top navbar with:
- TradeKaro logo on the left.
- Live market summary chips for NIFTY and SENSEX with value, absolute change, and percent change.
- A central/global search bar with placeholder: "Search for Anything [Ctrl + S]".
- Right-side navigation links:
  - Markets
  - Watchlist
  - Portfolio
  - Orders
  - Positions
  - Tools
  - Profile
- Notification bell icon.
- User avatar with initials.
- A compact theme toggle icon if needed.

The header must stay visible while scrolling and use a white surface with a very light border and soft shadow.

## Main Workspace
Below the header, the page should be divided into:
- A top content area for market overview and options discovery.
- A central trading panel for chart, option chain, and market depth.
- A lower area for watchlist, portfolio, orders, positions, and upload/search tools.

The layout should be modular and grid-based, but still feel like one unified trading screen.

---

# 2) Markets Menu

Create a full dropdown menu under "Markets" with the following items:

## Main Market Menu Items
- Option Chain
- Charts
- Stock Composition
- Favourite Strategies

Each item should have:
- Icon
- Title
- Short description
- Hover highlight
- Right-arrow or chevron if it leads to a deeper page

## Option Chain Page/Section
The Option Chain item must open a dedicated panel or route with:
- Search by symbol
- Expiry selector
- Strike interval controls
- Call side and put side columns
- Live LTP, bid, ask, IV, OI, change in OI, volume
- OTM/ITM visual highlighting
- Option chain filters:
  - All strikes
  - Near ATM
  - Calls only
  - Puts only
  - High OI
  - IV rank
  - Price range
  - Volume range
- Quick actions:
  - Buy CE
  - Buy PE
  - Sell CE
  - Sell PE
  - Add to watchlist
  - Add to strategy basket
- A pinned mini chart for the underlying instrument

## Charts Page/Section
The Charts item must open a charting module with:
- Symbol search
- Timeframe selector: 1m, 3m, 5m, 15m, 30m, 1h, 1D, 1W, 1M
- Chart types: Candlestick, Line, Area, OHLC
- Indicators: VWAP, EMA 9, EMA 21, SMA 20, RSI, MACD, Bollinger Bands, Volume
- Drawing tools: Trendline, Horizontal line, Fibonacci, Support/Resistance
- Crosshair, zoom, pan, and reset controls
- Save layout and chart template

## Stock Composition Page/Section
The Stock Composition item must show:
- Index or stock composition breakdown
- Sector allocation
- Weightage by stock
- Top contributors and top detractors
- Market cap segmentation: Large cap, Mid cap, Small cap
- Day change heatmap
- A pie chart or stacked bar visualization
- Export to CSV or PDF

## Favourite Strategies Page/Section
The Favourite Strategies item must show:
- User saved option strategies
- Strategy cards with: Strategy name, Symbol, Expiry, Legs count, Max profit, Max loss, Breakeven points, P&L snapshot
- Strategy actions: Open, Edit, Clone, Deploy as basket, Simulate, Delete
- Strategy categories: Bullish, Bearish, Neutral, Hedged, Income strategies
- Strategy builder CTA: "Build New Strategy"

---

# 3) Watchlist

The Watchlist page must be rich and detailed with the following features:

## Watchlist Core Features
- Multiple watchlists support.
- Create, rename, reorder, duplicate, and delete watchlists.
- Drag-and-drop reordering of symbols.
- Search within watchlist.
- Sort by: LTP, Change %, Volume, OI, Day high/low, Added date
- Pin important instruments at top.
- Real-time quote refresh.
- Compact and expanded row modes.

## Watchlist Tabs / Watchlist Types
- My Watchlist, Intraday Ideas, Options Watchlist, F&O Watchlist, Delivery Watchlist, Long-Term Watchlist, Index Watchlist, News Movers, Top Gainers, Top Losers, Volume Shakers, OI Shakers

## Watchlist Row Fields
Symbol, Company name, LTP, Change, Change %, Bid/Ask, Volume, High, Low, Open, Prev Close, OI (derivatives), IV (options), % change color coding, Quick action menu

## Watchlist Quick Actions
Buy, Sell, Open chart, Open option chain, Add alert, Add to basket, Remove from watchlist, Open news, Compare with another symbol

## Watchlist Filters
Equity, Index, Futures, Options, ETF, Currency, Commodity, High volume, High volatility, Near 52W high, Near 52W low

---

# 4) Portfolio

## Portfolio Overview
Total invested value, Current market value, Today's P&L, Realized P&L, Unrealized P&L, Overall return %, Available cash, Margin used, Margin available

## Portfolio Tabs
Holdings, Positions, Trades, Grouped Holdings, SIP/Recurring investments, Pledged holdings, Statements, Tax report

## Holdings Section
Symbol, Quantity, Average price, LTP, Current value, P&L, P&L %, Sector, Portfolio share %, Holding period

## Grouped Holdings
Group by: Long term, Short term, Swing, Intraday, Dividend, Sector, Theme, Custom strategy, Own research, Tips, High conviction, Hedge, Experiment

Each group: Group value, Group return, Allocation %, Stock count, Combined P&L, Expand/collapse, Rename/merge/delete actions

## Portfolio Actions
Buy more, Sell, Exit group, Rebalance, Add to watchlist, Create alert, Export statement, Download holdings report

---

# 5) Orders

## Order Tabs
Active Orders, Order History, Trade History, Basket Orders, Bracket/Cover Orders, GTT Orders, Pending Orders, Rejected Orders, Completed Orders

## Order Details
Order ID, Symbol, Buy/Sell side, Quantity, Order type, Product type, Price, Trigger price, Status, Exchange, Time placed, Filled quantity, Pending quantity, Average fill price, Rejection reason

## Order Actions
Modify, Cancel, Reorder, Convert product, Add to basket, View exchange response, Download order slip

## Order Entry Panel
Buy/Sell toggle, Market/Limit/SL/SL-M/BO/CO, Qty, Price, Trigger price, Margin details, Estimated brokerage, Estimated charges, Buy power check, Place order, Add to basket

---

# 6) Positions

## Position Tabs
Net Positions, Day Positions, Open Positions, Closed Positions, Options Positions, Futures Positions

## Position Fields
Symbol, Qty, Avg price, LTP, P&L, P&L %, Product type, Exchange, Realized P&L, Unrealized P&L, MTM, Intraday/delivery tag

## Position Actions
Square off, Reverse, Convert to delivery, Add stop-loss, Add target, Roll over, Hedge with option, View chart, Open option chain

---

# 7) Tools

## Trading Tools
Option Chain, Option Strategy Builder, Strategy Wizard, Open Interest Charts, Multi-strike OI charts, IV chart, Greeks calculator, P&L calculator, Brokerage calculator, Margin calculator, Break-even calculator, Risk-reward calculator, Options payoff chart, Volatility surface, Market depth, Quote board

## Screening and Analysis
Stock screener, Options screener, Market heatmap, Sector heatmap, Technical signals, Event calendar, Earnings calendar, Corporate actions, News analysis, FII/DII flow dashboard

## Trading Utilities
Basket creator, Draft portfolio builder, Position group manager, Alarm/alert manager, Notes for trades, Trade journal, Export report, Import report

Each tool should be clickable and open either a dedicated page or modal panel.

---

# 8) Profile

## Profile Sections
Personal details, KYC status, Bank details, Nominee details, Segment activation status, Margin details, Brokerage plan, Subscription plan, API access info, Security settings, Notification preferences, Language settings, Theme settings, Logout

## Profile Features
Edit profile, View masked account numbers, Download/upload KYC documents, Change password, Enable/disable 2FA, Change mobile/email, Configure price alerts, Session timeout settings, Login activity history

---

# 9) Security Master Upload System

## Data Ingestion Page (`/security-master`)
- File uploader: CSV, TXT, ZIP
- Drag-and-drop upload area
- File validation, size and format checks
- Upload progress bar
- Import summary: Total rows, Valid rows, Invalid rows, Duplicates, Instruments imported, Expiries found, Symbols found
- Auto-detect exchange: NSE / BSE
- Column mapping screen: Symbol, Instrument token, Exchange token, Expiry, Strike, Option type, Lot size, Tick size, Segment, Trading symbol, Underlying, ISIN, Series, Freeze quantity, Instrument type
- Re-import and overwrite options, Delta sync support, Scheduled refresh support

## Redis Storage
- Dockerized Redis service
- Key design for instruments, expiries, lookups (see Architecture Notes above)
- Background job to load file into Redis
- Search API queries Redis first, falls back to DB
- Dashboard search: NSE/BSE symbols, futures, options, expiries, strikes, trading symbols

## Dashboard Search Panel
Search by symbol/company/contract/expiry/strike/exchange, Autocomplete, Recent searches, Saved searches, Filters (Equity/F&O/Index/Options/Futures/BSE/NSE), Instant preview card, Quick open actions

---

# 10) Important Constraints

- Do not use Angle One copyrighted assets, logos, or exact source code.
- Create an original TradeKaro implementation that is functionally rich and visually inspired by premium Indian trading dashboards.
- Use original naming, icons, and layout variations.
- Focus on usability, speed, and options trading workflows.
- Make every major feature accessible from the dashboard without navigating away too much.
