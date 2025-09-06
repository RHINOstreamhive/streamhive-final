CREATE OR REPLACE VIEW v_creator_receipts AS
SELECT
  le.ref,
  max(le.created_at) AS created_at,
  -- viewer id is the one who paid; infer from the negative posting
  (SELECT user_id FROM ledger_entries WHERE ref = le.ref AND delta_cents < 0 LIMIT 1) AS viewer_id,
  -- creator id from positive posting with reason
  (SELECT user_id FROM ledger_entries WHERE ref = le.ref AND reason='subscription_purchase' AND delta_cents > 0 LIMIT 1) AS creator_id,
  -- gross/net/fee
  (SELECT -sum(delta_cents) FROM ledger_entries WHERE ref = le.ref AND delta_cents < 0) AS gross_cents,
  (SELECT sum(delta_cents)  FROM ledger_entries WHERE ref = le.ref AND reason='subscription_purchase' AND delta_cents > 0) AS net_cents,
  (SELECT sum(delta_cents)  FROM ledger_entries WHERE ref = le.ref AND user_id='platform:fees' AND reason='platform_fee') AS fee_cents
FROM ledger_entries le
GROUP BY le.ref;
