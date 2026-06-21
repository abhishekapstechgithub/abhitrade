#!/bin/bash
# Creates abhitrade_live and applies the full schema + all migrations.
# Runs inside the postgres container via docker-entrypoint-initdb.d on FIRST start.
# All SQL is idempotent (IF NOT EXISTS / IF EXISTS) — safe to re-run.
set -e

echo "[init-databases] Creating abhitrade_live..."

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
  SELECT 'CREATE DATABASE abhitrade_live'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abhitrade_live')\gexec
SQL

echo "[init-databases] Applying schema to abhitrade_live..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d abhitrade_live -f /docker-entrypoint-initdb.d/schema.sql

# Run migrations in order — all are idempotent (ADD COLUMN IF NOT EXISTS, etc.)
# On a fresh install these are no-ops; on upgrades they apply the missing changes.
for MIG in \
  /docker-entrypoint-initdb.d/migrate-password-nullable.sql \
  /docker-entrypoint-initdb.d/migrate-market-movers.sql \
  /docker-entrypoint-initdb.d/migrate-market-movers-v2.sql \
  /docker-entrypoint-initdb.d/migrate-bhavcopy-prices.sql \
  /docker-entrypoint-initdb.d/migrate-bhavcopy-widenpct.sql \
  /docker-entrypoint-initdb.d/migrate-index-prices.sql \
  /docker-entrypoint-initdb.d/migrate-angle-scrip.sql \
  /docker-entrypoint-initdb.d/migrate-angle-scrip-ltp.sql \
  /docker-entrypoint-initdb.d/migrate-angle-scrip-bhavcopy.sql \
  /docker-entrypoint-initdb.d/migrate-001-strategies.sql \
  /docker-entrypoint-initdb.d/migrate-002-paper-trading.sql \
  /docker-entrypoint-initdb.d/migrate-003-option-greeks.sql; do
  if [ -f "$MIG" ]; then
    echo "[init-databases]   → $(basename $MIG)"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d abhitrade_live -f "$MIG"
  fi
done

echo "[init-databases] Done."
