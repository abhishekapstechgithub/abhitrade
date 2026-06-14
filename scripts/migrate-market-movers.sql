-- Market Movers: top 50 stocks synced from Groww API.
-- is_gainer (mover_type) codes:
--   0 = losers           (TOP_LOSERS)
--   1 = gainers          (TOP_GAINERS)
--   2 = volume_shockers  (VOLUME_SHOCKERS)
--   3 = top_by_volume    (TRADED_BY_VOLUME)
--   4 = 52w_high         (YEARLY_HIGH)
--   5 = 52w_low          (YEARLY_LOW)
CREATE TABLE IF NOT EXISTS market_movers (
  id            BIGSERIAL     PRIMARY KEY,
  isin          VARCHAR(20),
  gsin          VARCHAR(20),
  company_name  VARCHAR(255)  NOT NULL,
  company_short VARCHAR(100),
  search_id     VARCHAR(255),
  nse_code      VARCHAR(30),
  bse_code      VARCHAR(30),
  ltp           NUMERIC(14,2) NOT NULL,
  prev_close    NUMERIC(14,2) NOT NULL,
  change        NUMERIC(14,2) NOT NULL,
  change_pct    NUMERIC(10,4) NOT NULL,
  market_cap    NUMERIC(18,2),
  year_high     NUMERIC(14,2),
  year_low      NUMERIC(14,2),
  volume        NUMERIC(20,0),
  logo_url      TEXT,
  tag           VARCHAR(100),
  is_gainer     INTEGER       NOT NULL DEFAULT 0,
  rank          INTEGER       NOT NULL,
  fetched_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_movers_type_rank ON market_movers(is_gainer, rank);
CREATE INDEX IF NOT EXISTS idx_mkt_movers_fetched   ON market_movers(fetched_at DESC);
