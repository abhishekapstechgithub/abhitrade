#!/bin/sh
set -e

FORCE=0
for arg in "$@"; do
  [ "$arg" = "--force" ] && FORCE=1
done

# ── Check if Redis already has data ──────────────────────────────────────────
EXISTING=$(node -e "
const Redis = require('ioredis');
const r = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
});
r.connect()
  .then(() => r.zcard('tk:auto'))
  .then(n => { process.stdout.write(String(n)); r.disconnect(); })
  .catch(() => { process.stdout.write('0'); });
" 2>/dev/null || echo 0)

if [ "$FORCE" = "0" ] && [ "$EXISTING" -gt 100000 ]; then
  echo "✅  Redis already has ${EXISTING} autocomplete entries — skipping CSV load."
  echo "    Run with --force to reload:  docker compose run --rm loader --force"
  exit 0
fi

# ── Auto-detect CSV / TXT files in /csv ──────────────────────────────────────
FILES=$(find /csv -maxdepth 1 \( -iname "*.csv" -o -iname "*.txt" \) 2>/dev/null | sort)

if [ -z "$FILES" ]; then
  echo "⚠️   No CSV/TXT files found in /csv — nothing to load."
  echo "    Mount your NSE/BSE security-master files into the container:"
  echo "      docker compose run --rm -v /path/to/your/csvs:/csv loader"
  exit 0
fi

echo "📂  Found files:"
echo "$FILES" | while read -r f; do echo "    $f"; done

echo ""
echo "🚀  Loading into Redis (host=${REDIS_HOST:-redis}:${REDIS_PORT:-6379})..."

# Pass all detected files to the bulk loader
# shellcheck disable=SC2086
exec node /app/scripts/bulk-load.mjs $FILES
