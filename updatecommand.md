# AbhiTrade — Production Update Commands

## Option A — Hub Deployment (Recommended)
> Server pulls pre-built image from Docker Hub. No source code needed on server.

### Step 1 — Local machine: build & push new image

```bash
cd "/mnt/c/Users/Abhishek Yadav/Downloads/TradeKaro"

# Build production image
docker-compose -f docker-compose.yml build app

# Tag and push to Docker Hub as :prod
docker tag tradekaro_app:latest abhishekdevopstech/tradekaro-app:prod
docker push abhishekdevopstech/tradekaro-app:prod
```

### Step 2 — On server: pull & restart

```bash
cd ~/TradeKaro

# Pull latest code (for schema / nginx config changes)
git pull origin main

# Pull new Docker image and recreate only the app container
docker-compose -f docker-compose.hub.yml pull app
docker-compose -f docker-compose.hub.yml up -d --no-deps app

# Verify
docker-compose -f docker-compose.hub.yml ps
docker-compose -f docker-compose.hub.yml logs --tail=30 app
```

---

## Option B — Build on Server Directly

```bash
cd ~/TradeKaro

git pull origin main

docker-compose up -d --build app

docker-compose logs --tail=30 app
```

---

## One-Liner (Hub deployment)

```bash
cd ~/TradeKaro && git pull origin main && \
docker-compose -f docker-compose.hub.yml pull app && \
docker-compose -f docker-compose.hub.yml up -d --no-deps app && \
docker-compose -f docker-compose.hub.yml logs --tail=20 app
```

---

## DB Migrations (run once after first deploy of new schema)

```bash
# Add volume column to market_movers (v2 migration)
docker-compose exec -T postgres psql -U tradekaro -d abhitrade_live \
  -c "ALTER TABLE market_movers ADD COLUMN IF NOT EXISTS volume NUMERIC(20,0);"

docker-compose exec -T postgres psql -U tradekaro -d abhitrade_papertrade \
  -c "ALTER TABLE market_movers ADD COLUMN IF NOT EXISTS volume NUMERIC(20,0);"
```

---

## Health Check After Deploy

```bash
# All containers running?
docker-compose -f docker-compose.hub.yml ps

# API health
curl -s https://abhitrade.online/api/health | python3 -m json.tool

# Force sync market movers (all 6 types from Groww)
curl -s -X POST https://abhitrade.online/api/market-movers | python3 -m json.tool

# Check for errors in logs
docker-compose -f docker-compose.hub.yml logs --tail=50 app | grep -i error
```

---

## Cache / Space Cleanup

```bash
# Remove stopped containers, dangling images, build cache
docker system prune -f

# Also remove unused volumes (WARNING: deletes DB data if containers are stopped)
docker system prune -f --volumes

# Check Docker disk usage
docker system df

# Clear Next.js build cache (local)
rm -rf .next

# Compact WSL2 virtual disk — run in PowerShell as Admin (local)
wsl --shutdown
Optimize-VHD -Path "$env:USERPROFILE\AppData\Local\Packages\CanonicalGroupLimited.Ubuntu*\LocalState\ext4.vhdx" -Mode Full
```

---

## Nginx Reload (without restarting container)

```bash
docker-compose exec nginx nginx -s reload
```

## SSL Certificate Renewal (manual)

```bash
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload

# Check cert expiry
docker-compose run --rm certbot certificates
```

---

## Useful Inspection Commands

```bash
# Exec into app container
docker-compose exec app sh

# Open Postgres shell
docker-compose exec postgres psql -U tradekaro -d abhitrade_live

# Open Redis CLI
docker-compose exec redis redis-cli

# Live logs from all services
docker-compose logs -f

# Live logs from app only
docker-compose logs -f app
```
