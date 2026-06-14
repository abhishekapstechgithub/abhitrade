#!/bin/bash
# Creates both trading databases and applies the full schema + all migrations.
# Runs inside the postgres container via docker-entrypoint-initdb.d on FIRST start.
# All SQL is idempotent (IF NOT EXISTS / IF EXISTS) — safe to re-run.
set -e

echo "[init-databases] Creating abhitrade_live and abhitrade_papertrade..."

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
  SELECT 'CREATE DATABASE abhitrade_live'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abhitrade_live')\gexec
  SELECT 'CREATE DATABASE abhitrade_papertrade'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abhitrade_papertrade')\gexec
SQL

for DB in abhitrade_live abhitrade_papertrade; do
  echo "[init-databases] Applying schema to $DB..."
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DB" -f /docker-entrypoint-initdb.d/schema.sql

  # Run migrations in order — all are idempotent (ADD COLUMN IF NOT EXISTS, etc.)
  # On a fresh install these are no-ops; on upgrades they apply the missing changes.
  for MIG in \
    /docker-entrypoint-initdb.d/migrate-password-nullable.sql \
    /docker-entrypoint-initdb.d/migrate-market-movers.sql \
    /docker-entrypoint-initdb.d/migrate-market-movers-v2.sql \
    /docker-entrypoint-initdb.d/migrate-bhavcopy-prices.sql; do
    if [ -f "$MIG" ]; then
      echo "[init-databases]   → $(basename $MIG)"
      psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DB" -f "$MIG"
    fi
  done
done

echo "[init-databases] Done."
