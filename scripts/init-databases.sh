#!/bin/bash
# Creates both trading databases and applies the shared schema to each.
# Runs inside the postgres container via docker-entrypoint-initdb.d on first start.
set -e

echo "[init-databases] Creating abhitrade_live and abhitrade_papertrade..."

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
  SELECT 'CREATE DATABASE abhitrade_live'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abhitrade_live')\gexec
  SELECT 'CREATE DATABASE abhitrade_papertrade'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'abhitrade_papertrade')\gexec
SQL

echo "[init-databases] Applying schema to abhitrade_live..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d abhitrade_live -f /docker-entrypoint-initdb.d/schema.sql

echo "[init-databases] Applying schema to abhitrade_papertrade..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d abhitrade_papertrade -f /docker-entrypoint-initdb.d/schema.sql

echo "[init-databases] Done."
