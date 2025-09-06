CREATE TABLE IF NOT EXISTS wallet_accounts(id SERIAL PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, balance_cents BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ledger_entries(id BIGSERIAL PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES wallet_accounts(id), delta_cents BIGINT NOT NULL, reason TEXT NOT NULL, ref TEXT, meta JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger_entries(account_id);
