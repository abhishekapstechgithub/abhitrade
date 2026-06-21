-- =============================================================================
-- Migration 002 — Paper trading tables
-- Applied to: abhitrade_live
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =============================================================================
\c abhitrade_live

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Virtual fund balances per user ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_balances (
    user_id        UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance        NUMERIC(15,2) NOT NULL DEFAULT 1000000.00,
    locked_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed a balance row for every existing user
INSERT INTO user_balances (user_id)
SELECT id FROM users
ON CONFLICT DO NOTHING;

-- ── Order log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_orders (
    order_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token            VARCHAR(50)  NOT NULL,
    symbol           VARCHAR(100) NOT NULL,
    exch_seg         VARCHAR(20)  NOT NULL,
    transaction_type VARCHAR(4)   NOT NULL CHECK (transaction_type IN ('BUY','SELL')),
    order_type       VARCHAR(10)  NOT NULL CHECK (order_type IN ('MARKET','LIMIT')),
    price            NUMERIC(10,2) NOT NULL DEFAULT 0,
    quantity         INTEGER      NOT NULL CHECK (quantity > 0),
    status           VARCHAR(12)  NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','EXECUTED','REJECTED','CANCELLED')),
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_user_id ON paper_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_orders_pending ON paper_orders(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_paper_orders_token   ON paper_orders(token);

-- ── Active positions (one row per user+token) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS user_positions (
    position_id   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token         VARCHAR(50)   NOT NULL,
    symbol        VARCHAR(100)  NOT NULL,
    exch_seg      VARCHAR(20)   NOT NULL,
    quantity      INTEGER       NOT NULL DEFAULT 0,
    average_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_positions_user ON user_positions(user_id);

-- ── Trade execution audit ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_trades (
    trade_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID          NOT NULL REFERENCES paper_orders(order_id),
    user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(50)   NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    quantity    INTEGER       NOT NULL,
    executed_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_user  ON paper_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_order ON paper_trades(order_id);
