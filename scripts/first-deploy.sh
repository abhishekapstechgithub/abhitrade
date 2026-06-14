#!/bin/bash
# scripts/first-deploy.sh
# Run this ONCE on a fresh production server.
# Does NOT require Docker Hub — builds the image directly from source.
#
# Usage:
#   git clone <repo> && cd abhitrade
#   cp .env.local.example .env.local
#   nano .env.local          # set JWT_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD
#   bash scripts/first-deploy.sh
set -e

echo ""
echo "══════════════════════════════════════════════════════"
echo "  AbhiTrade — First Production Deploy"
echo "══════════════════════════════════════════════════════"
echo ""

# ── 1. Sanity checks ─────────────────────────────────────────────────────────
if [ ! -f ".env.local" ]; then
  echo "ERROR: .env.local not found."
  echo "  cp .env.local.example .env.local && edit JWT_SECRET + passwords"
  exit 1
fi

if ! command -v docker-compose &>/dev/null; then
  echo "ERROR: docker-compose not found. Install it first."
  exit 1
fi

# ── 2. Build and start all services ──────────────────────────────────────────
echo "[1/4] Building and starting all services..."
docker-compose up -d --build

# ── 3. Wait for postgres to be healthy (schema auto-applies on first start) ──
echo "[2/4] Waiting for PostgreSQL to be ready..."
ATTEMPTS=0
until docker-compose exec -T postgres pg_isready -U tradekaro -d abhitrade_live &>/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ $ATTEMPTS -gt 30 ]; then
    echo "ERROR: PostgreSQL did not become ready after 60s."
    docker-compose logs postgres | tail -20
    exit 1
  fi
  echo "  still waiting... ($ATTEMPTS)"
  sleep 2
done
echo "  PostgreSQL is ready."

# ── 4. Wait for Next.js app to be healthy ────────────────────────────────────
echo "[3/4] Waiting for Next.js app to be ready..."
ATTEMPTS=0
until curl -sf http://localhost/api/health &>/dev/null; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [ $ATTEMPTS -gt 45 ]; then
    echo "ERROR: App did not become healthy after 90s."
    docker-compose logs app | tail -30
    exit 1
  fi
  echo "  still waiting... ($ATTEMPTS)"
  sleep 2
done
echo "  App is ready."

# ── 5. Get SSL cert (only if domain is set up) ───────────────────────────────
echo "[4/4] SSL setup..."
if curl -sf --max-time 5 "http://abhitrade.com/.well-known/acme-challenge/test" &>/dev/null || true; then
  echo "  Running SSL init for abhitrade.com..."
  bash scripts/ssl-init.sh
else
  echo "  Skipping SSL — run  bash scripts/ssl-init.sh  once DNS is pointed here."
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Deploy complete!"
echo ""
echo "  App:    http://$(curl -s ifconfig.me 2>/dev/null || echo '<server-ip>')"
echo "  HTTPS:  https://abhitrade.com  (after SSL setup)"
echo ""
echo "  Check status:  docker-compose ps"
echo "  Check logs:    docker-compose logs -f app"
echo "══════════════════════════════════════════════════════"
echo ""
