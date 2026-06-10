-- Run this against both abhitrade_live and abhitrade_papertrade
-- if the databases were created before the password_hash nullable change.
--
--   psql -h localhost -U abhitrade -d abhitrade_live -f scripts/migrate-password-nullable.sql
--   psql -h localhost -U abhitrade -d abhitrade_papertrade -f scripts/migrate-password-nullable.sql

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
