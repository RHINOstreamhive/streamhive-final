BEGIN;

-- Ensure base table exists
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

-- Backfill user_id from legacy columns, with casting where needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'wallet_id'
  ) THEN
    UPDATE ledger_entries SET user_id = COALESCE(user_id, wallet_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'account_id'
  ) THEN
    -- account_id may be INTEGER; cast to TEXT safely
    UPDATE ledger_entries SET user_id = COALESCE(user_id, account_id::text);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'userId'
  ) THEN
    UPDATE ledger_entries SET user_id = COALESCE(user_id, "userId");
  END IF;
END $$;

-- Fill any remaining nulls deterministically so we can enforce NOT NULL
UPDATE ledger_entries
SET user_id = 'legacy:' || id::text
WHERE user_id IS NULL;

-- Enforce NOT NULL on user_id
ALTER TABLE ledger_entries
  ALTER COLUMN user_id SET NOT NULL;

-- Drop legacy columns if they still exist (removes old NOT NULL constraints too)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'wallet_id'
  ) THEN
    ALTER TABLE ledger_entries DROP COLUMN wallet_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE ledger_entries DROP COLUMN account_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ledger_entries' AND column_name = 'userId'
  ) THEN
    ALTER TABLE ledger_entries DROP COLUMN "userId";
  END IF;
END $$;

-- Helpful index (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  c.relname = 'idx_ledger_entries_user_id'
    AND    n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_ledger_entries_user_id ON ledger_entries(user_id);
  END IF;
END $$;

COMMIT;
