-- Run this against abhitrade_live if the database was created before the password_hash nullable change.
--
--   psql -h localhost -U abhitrade -d abhitrade_live -f scripts/migrate-password-nullable.sql

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
