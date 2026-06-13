-- Market Movers: top 50 gainers and losers synced from Groww API
-- is_gainer: 1 = gainer, 0 = loser
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
  logo_url      TEXT,
  tag           VARCHAR(100),
  is_gainer     INTEGER       NOT NULL DEFAULT 0,   -- 1 = gainer, 0 = loser
  rank          INTEGER       NOT NULL,
  fetched_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_movers_type_rank ON market_movers(is_gainer, rank);
CREATE INDEX IF NOT EXISTS idx_mkt_movers_fetched   ON market_movers(fetched_at DESC);
