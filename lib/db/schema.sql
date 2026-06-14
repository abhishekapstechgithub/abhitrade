-- =============================================================================
-- AbhiTrade — PostgreSQL Schema
-- PostgreSQL is the source of truth for all domain data.
-- Redis is used only for fast search, autocomplete, and live quote caching.
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20)  UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),           -- nullable: OTP-only auth has no password
  kyc_status    VARCHAR(30)  NOT NULL DEFAULT 'pending',  -- pending/verified/rejected
  avatar_url    TEXT,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================================================
-- REFRESH TOKENS
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- =============================================================================
-- SECURITY MASTER
-- PostgreSQL stores canonical instrument metadata.
-- Redis mirrors searchable fields for autocomplete and fast lookup.
-- =============================================================================
CREATE TABLE IF NOT EXISTS security_master (
  id               BIGSERIAL    PRIMARY KEY,
  token            VARCHAR(50)  NOT NULL,
  exchange         VARCHAR(10)  NOT NULL,          -- NSE / BSE
  symbol           VARCHAR(100) NOT NULL,
  trading_symbol   VARCHAR(150),
  name             VARCHAR(255),
  series           VARCHAR(10),
  isin             VARCHAR(20),
  instrument_type  VARCHAR(30)  NOT NULL DEFAULT 'EQ',  -- EQ / FUT / CE / PE / IDX
  segment          VARCHAR(30),                          -- CM / FO / CD
  lot_size         INTEGER      NOT NULL DEFAULT 1,
  tick_size        DECIMAL(10,4) NOT NULL DEFAULT 0.05,
  strike           DECIMAL(12,2),                        -- options only
  expiry           DATE,                                  -- derivatives only
  option_type      VARCHAR(5),                            -- CE / PE
  underlying       VARCHAR(100),                          -- NIFTY, BANKNIFTY …
  freeze_quantity  INTEGER,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (token, exchange)
);

CREATE INDEX IF NOT EXISTS idx_sm_symbol          ON security_master(symbol);
CREATE INDEX IF NOT EXISTS idx_sm_trading_symbol  ON security_master(trading_symbol);
CREATE INDEX IF NOT EXISTS idx_sm_instrument_type ON security_master(instrument_type);
CREATE INDEX IF NOT EXISTS idx_sm_expiry          ON security_master(expiry) WHERE expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sm_underlying      ON security_master(underlying) WHERE underlying IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sm_isin            ON security_master(isin)   WHERE isin   IS NOT NULL;
-- Full-text search on name + symbol
CREATE INDEX IF NOT EXISTS idx_sm_fts ON security_master
  USING GIN(to_tsvector('english', coalesce(name,'') || ' ' || symbol));

-- =============================================================================
-- UPLOAD JOBS
-- Tracks every security master file import attempt.
-- =============================================================================
CREATE TABLE IF NOT EXISTS upload_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  filename       VARCHAR(255) NOT NULL,
  file_path      TEXT,
  file_size      BIGINT,
  source_exchange VARCHAR(10),                            -- NSE / BSE / AUTO
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending', -- pending/processing/completed/failed
  total_rows     INTEGER,
  valid_rows     INTEGER,
  invalid_rows   INTEGER,
  duplicate_rows INTEGER,
  error_message  TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_user   ON upload_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);

-- =============================================================================
-- WATCHLISTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS watchlists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID        NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  token           VARCHAR(50),
  exchange        VARCHAR(10)  NOT NULL,
  symbol          VARCHAR(100) NOT NULL,
  trading_symbol  VARCHAR(150),
  instrument_type VARCHAR(30),
  sort_order      INTEGER      NOT NULL DEFAULT 0,
  added_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (watchlist_id, symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_wl_items_watchlist ON watchlist_items(watchlist_id);

-- =============================================================================
-- ORDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id),
  broker_order_id  VARCHAR(100) UNIQUE,                 -- ID from broker/exchange
  token            VARCHAR(50),
  exchange         VARCHAR(10)  NOT NULL,
  symbol           VARCHAR(100) NOT NULL,
  trading_symbol   VARCHAR(150),
  transaction_type VARCHAR(5)   NOT NULL,               -- BUY / SELL
  order_type       VARCHAR(20)  NOT NULL,               -- MARKET/LIMIT/SL/SL-M/BO/CO
  product_type     VARCHAR(20)  NOT NULL,               -- MIS/CNC/NRML
  quantity         INTEGER      NOT NULL,
  price            DECIMAL(12,2),                       -- NULL for MARKET orders
  trigger_price    DECIMAL(12,2),
  status           VARCHAR(30)  NOT NULL DEFAULT 'pending',
  filled_quantity  INTEGER      NOT NULL DEFAULT 0,
  pending_quantity INTEGER      GENERATED ALWAYS AS (quantity - filled_quantity) STORED,
  average_price    DECIMAL(12,2),
  rejection_reason TEXT,
  variety          VARCHAR(20),                         -- NORMAL/BRACKET/COVER/AMO
  tag              VARCHAR(50),                         -- user-defined label
  is_paper         BOOLEAN      NOT NULL DEFAULT FALSE,
  placed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON orders(placed_at DESC);

-- =============================================================================
-- TRADES  (filled order legs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id),
  order_id         UUID         REFERENCES orders(id) ON DELETE SET NULL,
  broker_trade_id  VARCHAR(100),
  token            VARCHAR(50),
  exchange         VARCHAR(10)  NOT NULL,
  symbol           VARCHAR(100) NOT NULL,
  trading_symbol   VARCHAR(150),
  transaction_type VARCHAR(5)   NOT NULL,
  quantity         INTEGER      NOT NULL,
  price            DECIMAL(12,2) NOT NULL,
  trade_value      DECIMAL(15,2) GENERATED ALWAYS AS (quantity * price) STORED,
  brokerage        DECIMAL(10,4) NOT NULL DEFAULT 0,
  stt              DECIMAL(10,4) NOT NULL DEFAULT 0,
  exchange_charges DECIMAL(10,4) NOT NULL DEFAULT 0,
  gst              DECIMAL(10,4) NOT NULL DEFAULT 0,
  total_charges    DECIMAL(10,4) GENERATED ALWAYS AS
    (brokerage + stt + exchange_charges + gst) STORED,
  is_paper         BOOLEAN       NOT NULL DEFAULT FALSE,
  traded_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trades_user   ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_order  ON trades(order_id);
CREATE INDEX IF NOT EXISTS idx_trades_date   ON trades(traded_at DESC);

-- =============================================================================
-- HOLDINGS  (delivery / long-term positions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS holdings (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id),
  token               VARCHAR(50),
  exchange            VARCHAR(10)  NOT NULL,
  symbol              VARCHAR(100) NOT NULL,
  trading_symbol      VARCHAR(150),
  isin                VARCHAR(20),
  quantity            INTEGER      NOT NULL DEFAULT 0,
  t1_quantity         INTEGER      NOT NULL DEFAULT 0,  -- pending settlement
  average_price       DECIMAL(12,2) NOT NULL,
  pledged_quantity    INTEGER      NOT NULL DEFAULT 0,
  group_name          VARCHAR(100),                     -- user grouping label
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);

-- =============================================================================
-- POSITIONS  (intraday / F&O open positions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS positions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id),
  token            VARCHAR(50),
  exchange         VARCHAR(10)  NOT NULL,
  symbol           VARCHAR(100) NOT NULL,
  trading_symbol   VARCHAR(150),
  product_type     VARCHAR(20)  NOT NULL,               -- MIS/NRML
  quantity         INTEGER      NOT NULL DEFAULT 0,
  buy_quantity     INTEGER      NOT NULL DEFAULT 0,
  sell_quantity    INTEGER      NOT NULL DEFAULT 0,
  average_price    DECIMAL(12,2),
  buy_average      DECIMAL(12,2),
  sell_average     DECIMAL(12,2),
  last_price       DECIMAL(12,2),
  realized_pnl     DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_paper         BOOLEAN       NOT NULL DEFAULT FALSE,
  trade_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol, exchange, product_type, trade_date, is_paper)
);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_date ON positions(trade_date DESC);

-- =============================================================================
-- ALERTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        VARCHAR(50),
  exchange     VARCHAR(10)  NOT NULL,
  symbol       VARCHAR(100) NOT NULL,
  condition    VARCHAR(30)  NOT NULL,   -- PRICE_ABOVE/PRICE_BELOW/PCT_CHANGE_UP/PCT_CHANGE_DOWN/VOLUME_ABOVE
  target_value DECIMAL(12,2) NOT NULL,
  message      TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active/triggered/expired/paused
  triggered_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  notify_email BOOLEAN      NOT NULL DEFAULT TRUE,
  notify_push  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user   ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);

-- =============================================================================
-- SAVED STRATEGIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS saved_strategies (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(150) NOT NULL,
  category   VARCHAR(50),   -- Bullish/Bearish/Neutral/Hedged/Income
  underlying VARCHAR(100),
  expiry     DATE,
  legs       JSONB        NOT NULL DEFAULT '[]',
  notes      TEXT,
  is_public  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON saved_strategies(user_id);

-- =============================================================================
-- MARKET QUOTES  (live price snapshot synced from AngelOne every 4 h)
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_quotes (
  id              BIGSERIAL     PRIMARY KEY,
  exchange        VARCHAR(10)   NOT NULL,
  symbol          VARCHAR(100)  NOT NULL,
  trading_symbol  VARCHAR(150),
  token           VARCHAR(50),
  ltp             DECIMAL(12,2),
  open            DECIMAL(12,2),
  high            DECIMAL(12,2),
  low             DECIMAL(12,2),
  close           DECIMAL(12,2),
  net_change      DECIMAL(12,2),
  percent_change  DECIMAL(8,4),
  volume          BIGINT,
  avg_price       DECIMAL(12,2),
  open_interest   BIGINT,
  week52_high     DECIMAL(12,2),
  week52_low      DECIMAL(12,2),
  upper_circuit   VARCHAR(20),
  lower_circuit   VARCHAR(20),
  last_trade_qty  INTEGER,
  exch_feed_time  VARCHAR(50),
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS idx_mq_symbol ON market_quotes(symbol);
CREATE INDEX IF NOT EXISTS idx_mq_synced ON market_quotes(synced_at DESC);

-- =============================================================================
-- TRADE JOURNAL
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id    UUID         REFERENCES trades(id) ON DELETE SET NULL,
  symbol      VARCHAR(100),
  entry_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  title       VARCHAR(255),
  body        TEXT,
  tags        TEXT[],
  mood        VARCHAR(20),   -- confident/uncertain/fearful/greedy
  pnl         DECIMAL(15,2),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id);

-- =============================================================================
-- MARKET MOVERS  (top stocks synced from Groww API every 60 s during market hours)
-- is_gainer codes: 0=losers 1=gainers 2=volume_shockers 3=top_by_volume 4=52w_high 5=52w_low
-- =============================================================================
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

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','watchlists','watchlist_items','orders',
    'holdings','positions','alerts','saved_strategies','security_master'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END; $$;
