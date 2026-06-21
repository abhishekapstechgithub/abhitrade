-- Migration: EOD market columns on angle_scrip (populated from Bhavcopy uploads)
-- Idempotent — safe to run multiple times.

ALTER TABLE angle_scrip
  ADD COLUMN IF NOT EXISTS prev_close    NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS change_pct   NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS volume        BIGINT,
  ADD COLUMN IF NOT EXISTS open_interest BIGINT,
  ADD COLUMN IF NOT EXISTS price_date    DATE;

CREATE INDEX IF NOT EXISTS idx_angle_scrip_price_date
  ON angle_scrip (price_date) WHERE price_date IS NOT NULL;
