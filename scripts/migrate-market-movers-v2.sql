-- Migration v2: add volume column + extend is_gainer to support 6 mover types
-- is_gainer codes:
--   0 = losers
--   1 = gainers
--   2 = volume_shockers
--   3 = top_by_volume
--   4 = 52w_high
--   5 = 52w_low

-- Add volume column (idempotent — fails silently if already exists)
ALTER TABLE market_movers ADD COLUMN IF NOT EXISTS volume NUMERIC(20,0);

-- Drop old index on is_gainer if it exists (will be recreated below)
DROP INDEX IF EXISTS idx_mkt_movers_type_rank;

-- Recreate composite index covering all 6 type codes
CREATE INDEX IF NOT EXISTS idx_mkt_movers_type_rank ON market_movers(is_gainer, rank);
