-- 001_schema.sql (StreamHive Wallets + Subscriptions + minimal ledger)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Creators
CREATE TABLE IF NOT EXISTS creators (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id            BIGSERIAL PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user','creator')),
  owner_id      BIGINT NOT NULL,
  diamonds      BIGINT NOT NULL DEFAULT 0,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_type, owner_id)
);

-- Wallet transactions
CREATE TABLE IF NOT EXISTS wallet_txns (
  id           BIGSERIAL PRIMARY KEY,
  wallet_id    BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  kind         TEXT   NOT NULL CHECK (kind IN ('credit','debit','diamonds_add','diamonds_sub','payout')),
  amount_cents BIGINT NOT NULL DEFAULT 0,
  diamonds     BIGINT NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Creator tiers
CREATE TABLE IF NOT EXISTS tiers (
  id          BIGSERIAL PRIMARY KEY,
  creator_id  BIGINT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name        TEXT   NOT NULL,
  price_cents INT    NOT NULL CHECK (price_cents >= 0),
  perks       JSONB  NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id  BIGINT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  tier_id     BIGINT NOT NULL REFERENCES tiers(id),
  status      TEXT   NOT NULL CHECK (status IN ('active','canceled','past_due')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  UNIQUE(user_id, creator_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount_cents    INT    NOT NULL CHECK (amount_cents >= 0),
  status          TEXT   NOT NULL CHECK (status IN ('succeeded','failed','pending')),
  provider        TEXT   NOT NULL DEFAULT 'test',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Minimal accounting transactions used by generateAuditPack.ts
CREATE TABLE IF NOT EXISTS transactions (
  id          BIGSERIAL PRIMARY KEY,
  posted_at   DATE NOT NULL,
  account     TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  debit       NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit      NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tx_posted_at ON transactions(posted_at);

-- Helper functions (wallets)
CREATE OR REPLACE FUNCTION wallet_add_diamonds(p_wallet BIGINT, p_diamonds BIGINT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF p_diamonds <= 0 THEN RAISE EXCEPTION 'diamonds must be > 0'; END IF;
  UPDATE wallets SET diamonds = diamonds + p_diamonds, updated_at = now() WHERE id = p_wallet;
  INSERT INTO wallet_txns(wallet_id, kind, diamonds, note) VALUES(p_wallet, 'diamonds_add', p_diamonds, p_note);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wallet_sub_diamonds(p_wallet BIGINT, p_diamonds BIGINT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE cur BIGINT;
BEGIN
  IF p_diamonds <= 0 THEN RAISE EXCEPTION 'diamonds must be > 0'; END IF;
  SELECT diamonds INTO cur FROM wallets WHERE id = p_wallet FOR UPDATE;
  IF cur < p_diamonds THEN RAISE EXCEPTION 'insufficient diamonds'; END IF;
  UPDATE wallets SET diamonds = diamonds - p_diamonds, updated_at = now() WHERE id = p_wallet;
  INSERT INTO wallet_txns(wallet_id, kind, diamonds, note) VALUES(p_wallet, 'diamonds_sub', p_diamonds, p_note);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wallet_credit_cents(p_wallet BIGINT, p_cents BIGINT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF p_cents <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  UPDATE wallets SET balance_cents = balance_cents + p_cents, updated_at = now() WHERE id = p_wallet;
  INSERT INTO wallet_txns(wallet_id, kind, amount_cents, note) VALUES(p_wallet, 'credit', p_cents, p_note);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wallet_debit_cents(p_wallet BIGINT, p_cents BIGINT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE cur BIGINT;
BEGIN
  IF p_cents <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  SELECT balance_cents INTO cur FROM wallets WHERE id = p_wallet FOR UPDATE;
  IF cur < p_cents THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  UPDATE wallets SET balance_cents = balance_cents - p_cents, updated_at = now() WHERE id = p_wallet;
  INSERT INTO wallet_txns(wallet_id, kind, amount_cents, note) VALUES(p_wallet, 'debit', p_cents, p_note);
END; $$ LANGUAGE plpgsql;

-- View
CREATE OR REPLACE VIEW v_wallets AS
SELECT w.*,
       COALESCE((SELECT SUM(CASE WHEN kind IN ('credit','payout') THEN amount_cents ELSE -amount_cents END)
                 FROM wallet_txns t WHERE t.wallet_id=w.id), 0) AS tx_sum_cents
FROM wallets w;
