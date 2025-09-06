-- Pools (one per run/period)
create table if not exists payout_pools (
  id                bigserial primary key,
  period            text not null,           -- 'daily'|'weekly'|'monthly'
  run_started_at    timestamptz not null default now(),
  eligible_revenue  numeric(18,2) not null,
  pool_ceiling_usd  numeric(18,2) not null,
  total_base_usd    numeric(18,2) not null,
  scale_factor      numeric(9,6)  not null,
  total_alloc_usd   numeric(18,2) not null,
  total_deferred_usd numeric(18,2) not null,
  revenue_ad_usd    numeric(18,2) not null,
  revenue_subs_usd  numeric(18,2) not null,
  revenue_other_usd numeric(18,2) not null,
  fx_rate_usdzar    numeric(12,6),           -- if used
  input_hash        text not null,           -- sha256 of inputs (revenue+views)
  output_hash       text not null,           -- sha256 of PoolResult JSON
  prev_output_hash  text,                    -- hash chain
  raw_json          jsonb not null
);

-- Per-creator results for each pool run
create table if not exists payout_creator_results (
  id                bigserial primary key,
  pool_id           bigint not null references payout_pools(id) on delete cascade,
  creator_id        text not null,
  base_usd          numeric(18,2) not null,
  scaled_usd        numeric(18,2) not null,
  diamonds          bigint not null,
  scale_applied     numeric(9,6) not null,
  deferred_usd      numeric(18,2) not null,
  flags             text[] not null default '{}'
);

-- Settlements (actual credits)
create table if not exists creator_settlements (
  id                bigserial primary key,
  pool_id           bigint not null references payout_pools(id) on delete restrict,
  creator_id        text not null,
  diamonds_credited bigint not null,
  usd_equiv         numeric(18,2) not null,
  ledger_tx_id      text not null,           -- link to your internal ledger transfer
  status            text not null default 'SETTLED', -- or 'PENDING','REVERSED'
  settled_at        timestamptz not null default now()
);

-- High-level audit events (job runs, overrides)
create table if not exists audit_events (
  id                bigserial primary key,
  actor             text not null,           -- service account or admin user
  action            text not null,           -- e.g., 'POOL_RUN','SETTLEMENT','OVERRIDE','CASE_OPEN'
  ref_type          text,                    -- 'pool','creator','settlement'
  ref_id            text,
  details           jsonb,
  created_at        timestamptz not null default now()
);
