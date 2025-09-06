-- 002_seed.sql

-- Users (put ON CONFLICT once, after the multi-VALUES; include conflict target)
INSERT INTO users (email) VALUES
  ('creator@example.com'),
  ('fan1@example.com')
ON CONFLICT (email) DO NOTHING;

-- Creator row
INSERT INTO creators (user_id, display_name)
SELECT id, 'StreamHive Creator' FROM users WHERE email='creator@example.com'
ON CONFLICT DO NOTHING;

-- Wallets
INSERT INTO wallets(owner_type, owner_id)
SELECT 'creator', c.id FROM creators c
ON CONFLICT DO NOTHING;

INSERT INTO wallets(owner_type, owner_id)
SELECT 'user', u.id FROM users u WHERE email='fan1@example.com'
ON CONFLICT DO NOTHING;

-- One tier
INSERT INTO tiers(creator_id, name, price_cents, perks)
SELECT c.id, 'Supporter', 4900, '{"discord":"vip","badge":true}'::jsonb
FROM creators c
ON CONFLICT DO NOTHING;

-- Optional diamond/balance seed
DO $$
DECLARE w BIGINT;
BEGIN
  SELECT id INTO w FROM wallets WHERE owner_type='creator' LIMIT 1;
  IF w IS NOT NULL THEN
    PERFORM wallet_add_diamonds(w, 1000, 'seed diamonds');
    PERFORM wallet_credit_cents(w, 10000, 'seed balance cents');
  END IF;
END $$;

-- Minimal accounting demo rows so the generator can read from "transactions"
-- Adjust dates to your reporting periods as needed
INSERT INTO transactions (posted_at, account, description, debit, credit) VALUES
  ('2025-01-01','1000-Sales','Opening sale',0,1000.00),
  ('2025-01-05','5000-COGS','Cost of goods',400.00,0),
  ('2025-02-01','6100-Rent','Office rent',300.00,0),
  ('2025-02-28','1100-Cash','Cash top-up',300.00,0);
