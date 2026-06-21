-- Migration: add LTP + OHLC columns to angle_scrip
-- Idempotent — safe to run multiple times.

ALTER TABLE angle_scrip
  ADD COLUMN IF NOT EXISTS ltp          NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS open         NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS high         NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS low          NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS close        NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS ltp_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_angle_scrip_ltp_updated ON angle_scrip (ltp_updated_at) WHERE ltp_updated_at IS NOT NULL;
