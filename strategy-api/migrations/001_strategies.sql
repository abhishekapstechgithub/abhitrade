-- =============================================================================
-- Migration 001 — Strategy module tables
-- Applied to: abhitrade_live
-- All statements are idempotent (IF NOT EXISTS).
-- =============================================================================
\c abhitrade_live

-- Enable UUID extension (already present in schema.sql but safe to repeat)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- STRATEGIES
-- Replaces the thin `saved_strategies` table with a fully typed version.
-- Note: saved_strategies is kept for backward compatibility with existing rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS strategies (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(150)  NOT NULL,
    symbol          VARCHAR(100)  NOT NULL,
    exchange        VARCHAR(10)   NOT NULL DEFAULT 'NSE',
    category        VARCHAR(50)   NOT NULL DEFAULT 'neutral',
    status          VARCHAR(30)   NOT NULL DEFAULT 'saved',
    -- Legs stored as JSONB array: [{action, optionType, strike, expiry, lots, premium, iv, delta, theta}]
    legs            JSONB         NOT NULL DEFAULT '[]',
    max_profit      DECIMAL(15,2),
    max_loss        DECIMAL(15,2),
    breakeven_low   DECIMAL(15,2),
    breakeven_high  DECIMAL(15,2),
    net_premium     DECIMAL(15,2) NOT NULL DEFAULT 0,
    tags            TEXT[]        NOT NULL DEFAULT '{}',
    notes           TEXT,
    -- Raw builder graph for re-editing in the visual canvas
    builder_json    JSONB,
    -- Deployment tracking
    deployed_at     TIMESTAMPTZ,
    basket_id       VARCHAR(100),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategies_user_id   ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_symbol    ON strategies(symbol);
CREATE INDEX IF NOT EXISTS idx_strategies_category  ON strategies(category);
CREATE INDEX IF NOT EXISTS idx_strategies_status    ON strategies(status);
CREATE INDEX IF NOT EXISTS idx_strategies_created   ON strategies(created_at DESC);
-- GIN index for tag array lookups
CREATE INDEX IF NOT EXISTS idx_strategies_tags      ON strategies USING GIN(tags);

-- =============================================================================
-- BACKTEST JOBS
-- One row per backtest run request. Stores config + aggregated results.
-- Individual trade rows live in backtest_trades for efficient pagination.
-- =============================================================================

CREATE TABLE IF NOT EXISTS backtest_jobs (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id         UUID          NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    user_id             UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(30)   NOT NULL DEFAULT 'queued',
    -- Run configuration (denormalised — strategy may be edited after the run)
    from_date           DATE          NOT NULL,
    to_date             DATE          NOT NULL,
    timeframe           VARCHAR(10)   NOT NULL DEFAULT '1D',
    initial_capital     DECIMAL(15,2) NOT NULL DEFAULT 100000,
    slippage_pct        DECIMAL(8,4)  NOT NULL DEFAULT 0.05,
    brokerage_per_lot   DECIMAL(10,2) NOT NULL DEFAULT 40,
    -- Snapshot of strategy identity at run time
    strategy_name       VARCHAR(150),
    strategy_symbol     VARCHAR(100),
    strategy_exchange   VARCHAR(10),
    strategy_category   VARCHAR(50),
    -- Aggregate results (NULL until status = completed)
    metrics             JSONB,
    equity_curve        JSONB,
    monthly_returns     JSONB,
    -- Failure info
    error_msg           TEXT,
    -- Timing
    duration_ms         INTEGER,
    queued_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_backtest_status CHECK (status IN ('queued','running','completed','failed'))
);

CREATE INDEX IF NOT EXISTS idx_bj_user_id      ON backtest_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bj_strategy_id  ON backtest_jobs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_bj_status       ON backtest_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bj_created      ON backtest_jobs(created_at DESC);

-- =============================================================================
-- BACKTEST TRADES
-- Individual trade records for each completed backtest job.
-- Kept in a separate table so large trade logs don't bloat the jobs row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS backtest_trades (
    id            BIGSERIAL     PRIMARY KEY,
    job_id        UUID          NOT NULL REFERENCES backtest_jobs(id) ON DELETE CASCADE,
    trade_seq     INTEGER       NOT NULL,
    entry_date    DATE          NOT NULL,
    exit_date     DATE          NOT NULL,
    entry_time    VARCHAR(5)    NOT NULL DEFAULT '09:15',
    exit_time     VARCHAR(5)    NOT NULL DEFAULT '15:25',
    symbol        VARCHAR(100)  NOT NULL,
    side          VARCHAR(10)   NOT NULL,
    entry_level   DECIMAL(12,2) NOT NULL,
    exit_level    DECIMAL(12,2) NOT NULL,
    qty           INTEGER       NOT NULL DEFAULT 1,
    gross_pnl     DECIMAL(15,2) NOT NULL,
    brokerage     DECIMAL(10,2) NOT NULL DEFAULT 0,
    net_pnl       DECIMAL(15,2) NOT NULL,
    pnl_pct       DECIMAL(10,4) NOT NULL,
    exit_reason   VARCHAR(30)   NOT NULL,
    holding_mins  INTEGER       NOT NULL DEFAULT 0,
    mfe           DECIMAL(15,2) NOT NULL DEFAULT 0,
    mae           DECIMAL(15,2) NOT NULL DEFAULT 0,

    UNIQUE (job_id, trade_seq),
    CONSTRAINT ck_trade_side   CHECK (side IN ('LONG','SHORT')),
    CONSTRAINT ck_exit_reason  CHECK (exit_reason IN ('TARGET','STOPLOSS','TRAILING','TIME_EXIT','EOD','SIGNAL'))
);

CREATE INDEX IF NOT EXISTS idx_bt_trades_job     ON backtest_trades(job_id);
CREATE INDEX IF NOT EXISTS idx_bt_trades_date    ON backtest_trades(exit_date);
CREATE INDEX IF NOT EXISTS idx_bt_trades_pnl     ON backtest_trades(net_pnl);

-- =============================================================================
-- updated_at trigger for strategies
-- =============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_strategies_updated'
    ) THEN
        CREATE TRIGGER trg_strategies_updated
        BEFORE UPDATE ON strategies
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;
