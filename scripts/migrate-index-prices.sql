-- Create index_prices table for NSE/BSE index EOD bhavcopy data.
-- This table was missing from the initial schema — safe to re-run (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS index_prices (
  id               BIGSERIAL     PRIMARY KEY,
  symbol           VARCHAR(200)  NOT NULL,
  exchange         VARCHAR(10)   NOT NULL DEFAULT 'NSE',
  price_date       DATE          NOT NULL,
  open_price       DECIMAL(12,2),
  high_price       DECIMAL(12,2),
  low_price        DECIMAL(12,2),
  close_price      DECIMAL(12,2),
  prev_close       DECIMAL(12,2),
  net_change       DECIMAL(12,2),
  change_pct       DECIMAL(10,4),
  volume           BIGINT,
  high_52w         DECIMAL(12,2),
  low_52w          DECIMAL(12,2),
  pe_ratio         DECIMAL(10,2),
  pb_ratio         DECIMAL(10,2),
  div_yield        DECIMAL(8,4),
  price_updated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, exchange, price_date)
);

CREATE INDEX IF NOT EXISTS idx_ip_symbol ON index_prices(symbol);
CREATE INDEX IF NOT EXISTS idx_ip_date   ON index_prices(price_date DESC);
CREATE INDEX IF NOT EXISTS idx_ip_exch   ON index_prices(exchange, price_date DESC);
