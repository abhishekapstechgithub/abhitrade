-- Migration: add live market data columns to angle_scrip
-- Populated by market-sync every 60s from AngelOne /market/v1/quote/ FULL mode.
-- Idempotent — safe to run multiple times.

ALTER TABLE angle_scrip
  ADD COLUMN IF NOT EXISTS net_change    NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS avg_price     NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS week52_high   NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS week52_low    NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS upper_circuit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS lower_circuit VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tot_buy_qty   BIGINT,
  ADD COLUMN IF NOT EXISTS tot_sell_qty  BIGINT;

-- Index for name-based search (users type underlying name e.g. "HDFC", "NIFTY")
CREATE INDEX IF NOT EXISTS idx_angle_scrip_name ON angle_scrip (name);

-- Composite index for the common live-data lookup: token → price update
CREATE INDEX IF NOT EXISTS idx_angle_scrip_token_ltp
  ON angle_scrip (token, ltp_updated_at)
  WHERE ltp IS NOT NULL;
