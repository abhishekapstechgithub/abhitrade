-- Widen change_pct from DECIMAL(8,4) to DECIMAL(12,4)
-- Options with low prev_close (e.g. 0.05) can have 10000%+ changes which overflowed DECIMAL(8,4).
-- DECIMAL(12,4) allows up to 99,999,999.9999 — covers any real-world scenario.
-- This ALTER is safe on an empty column and idempotent (widening a numeric type never loses data).
ALTER TABLE security_master
  ALTER COLUMN change_pct TYPE DECIMAL(12,4);
