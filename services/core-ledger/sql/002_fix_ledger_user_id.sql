-- Ensure table exists with required columns
CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  delta_cents INTEGER NOT NULL,
  ref TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add user_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ledger_entries ADD COLUMN user_id TEXT;
  END IF;
END $$;

-- Migrate from legacy column names to user_id when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'wallet_id'
  ) THEN
    UPDATE ledger_entries SET user_id = COALESCE(user_id, wallet_id);
    ALTER TABLE ledger_entries DROP COLUMN wallet_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'account_id'
  ) THEN
    UPDATE ledger_entries SET user_id = COALESCE(user_id, account_id);
    ALTER TABLE ledger_entries DROP COLUMN account_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'userId'
  ) THEN
    UPDATE ledger_entries SET user_id = COALESCE(user_id, userId);
    ALTER TABLE ledger_entries DROP COLUMN "userId";
  END IF;
END $$;

-- Enforce NOT NULL after backfill
ALTER TABLE ledger_entries
  ALTER COLUMN user_id SET NOT NULL;

-- Helpful index (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_ledger_entries_user_id' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_ledger_entries_user_id ON ledger_entries(user_id);
  END IF;
END $$;
