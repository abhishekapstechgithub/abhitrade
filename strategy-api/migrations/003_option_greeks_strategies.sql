-- =============================================================================
-- Migration 003 — Option Greeks cache + Paper strategy basket tables
-- Applied to: abhitrade_live
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Option Greeks Cache ───────────────────────────────────────────────────────
-- Stores Greeks fetched from Angel One's option Greek API.
-- TTL is managed at the application layer (Redis) during market hours;
-- this table keeps a persistent snapshot for audit / off-hours fallback.
CREATE TABLE IF NOT EXISTS option_greeks_cache (
    id               SERIAL        PRIMARY KEY,
    underlying_name  VARCHAR(50)   NOT NULL,
    expiry           DATE          NOT NULL,
    strike_price     DECIMAL(10,2) NOT NULL,
    option_type      VARCHAR(2)    NOT NULL CHECK (option_type IN ('CE','PE')),
    delta            DECIMAL(8,6),
    gamma            DECIMAL(8,6),
    theta            DECIMAL(8,6),
    vega             DECIMAL(8,6),
    implied_volatility DECIMAL(6,3),
    trade_volume     DECIMAL(15,2),
    ltp              DECIMAL(10,2),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Composite lookup index (underlying + expiry + strike + type)
CREATE INDEX IF NOT EXISTS idx_greeks_composite
    ON option_greeks_cache (underlying_name, expiry, strike_price, option_type);

CREATE INDEX IF NOT EXISTS idx_greeks_underlying_expiry
    ON option_greeks_cache (underlying_name, expiry);

-- ── Paper Strategies (multi-leg basket parent) ────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_strategies (
    strategy_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    strategy_name VARCHAR(150) NOT NULL,
    underlying    VARCHAR(50),
    status        VARCHAR(10)  NOT NULL DEFAULT 'EXECUTED'
                  CHECK (status IN ('PENDING','EXECUTED','CLOSED')),
    net_premium   DECIMAL(15,2) NOT NULL DEFAULT 0,
    -- Payoff graph stored as JSONB array: [{spot, pnl}, ...]
    payoff_graph  JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paper_strategies_user    ON paper_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_strategies_status  ON paper_strategies(status);
CREATE INDEX IF NOT EXISTS idx_paper_strategies_created ON paper_strategies(created_at DESC);

-- ── Add strategy_id to paper_orders (nullable — single orders have NULL) ──────
ALTER TABLE paper_orders
    ADD COLUMN IF NOT EXISTS strategy_id UUID
        REFERENCES paper_strategies(strategy_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_paper_orders_strategy ON paper_orders(strategy_id)
    WHERE strategy_id IS NOT NULL;

-- ── Add strategy_id to user_positions + fix unique constraint ─────────────────
-- The old UNIQUE(user_id, token) only supports one position per token globally.
-- With strategies, the same token can appear in multiple strategy baskets.
-- New logic: one row per (user_id, token) for standalone orders (strategy_id IS NULL)
--            one row per (user_id, token, strategy_id) for strategy positions.

ALTER TABLE user_positions
    ADD COLUMN IF NOT EXISTS strategy_id UUID
        REFERENCES paper_strategies(strategy_id) ON DELETE SET NULL;

-- Drop old single-column constraint (may not exist if already migrated)
ALTER TABLE user_positions
    DROP CONSTRAINT IF EXISTS user_positions_user_id_token_key;

-- Partial unique index: standalone positions (no strategy)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_user_token_standalone
    ON user_positions(user_id, token)
    WHERE strategy_id IS NULL;

-- Partial unique index: strategy-linked positions
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_user_token_strategy
    ON user_positions(user_id, token, strategy_id)
    WHERE strategy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_strategy ON user_positions(strategy_id)
    WHERE strategy_id IS NOT NULL;
