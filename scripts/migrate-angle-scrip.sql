-- Migration: angle_scrip table for AngelOne OpenAPI ScripMaster data
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS angle_scrip (
  token          TEXT        PRIMARY KEY,
  symbol         TEXT        NOT NULL,
  name           TEXT        NOT NULL DEFAULT '',
  expiry         DATE,
  strike         NUMERIC(18, 6) NOT NULL DEFAULT 0,
  lotsize        INTEGER     NOT NULL DEFAULT 1,
  instrumenttype TEXT        NOT NULL DEFAULT '',
  exch_seg       TEXT        NOT NULL DEFAULT '',
  tick_size      NUMERIC(18, 6) NOT NULL DEFAULT 0,
  freeze_qty     INTEGER     NOT NULL DEFAULT 0,
  loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_angle_scrip_symbol     ON angle_scrip (symbol);
CREATE INDEX IF NOT EXISTS idx_angle_scrip_exch_seg   ON angle_scrip (exch_seg);
CREATE INDEX IF NOT EXISTS idx_angle_scrip_instrtype  ON angle_scrip (instrumenttype);
CREATE INDEX IF NOT EXISTS idx_angle_scrip_expiry     ON angle_scrip (expiry) WHERE expiry IS NOT NULL;
