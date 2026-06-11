-- Add EOD price columns to security_master (idempotent — safe to re-run)
ALTER TABLE security_master
  ADD COLUMN IF NOT EXISTS ltp              DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS open_price       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS high_price       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS low_price        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS close_price      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS prev_close       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS net_change       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS change_pct       DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS volume           BIGINT,
  ADD COLUMN IF NOT EXISTS open_interest    BIGINT,
  ADD COLUMN IF NOT EXISTS price_date       DATE,
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sm_price_date ON security_master(price_date) WHERE price_date IS NOT NULL;
