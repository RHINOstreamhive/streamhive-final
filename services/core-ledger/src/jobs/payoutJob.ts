import { computePayouts, type CreatorViewStats, type RevenueContext } from '../payoutGovernor';
import crypto from 'crypto';
import { Pool } from 'pg';

// demo inputs
const creators: CreatorViewStats[] = [ /* … */ ];
const revenue: RevenueContext = { /* … */ };

async function main() {
  const pool = computePayouts(creators, revenue);

  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const inputsForHash = JSON.stringify({ creators, revenue });
  const inputHash = sha(inputsForHash);
  const outputHash = sha(JSON.stringify(pool));

  const pg = new Pool({ connectionString: process.env.DATABASE_URL });
  const prev = await pg.query('select output_hash from payout_pools order by id desc limit 1');
  const prevHash = prev.rows[0]?.output_hash ?? null;

  const ins = await pg.query(
    `insert into payout_pools
     (period, eligible_revenue, pool_ceiling_usd, total_base_usd, scale_factor,
      total_alloc_usd, total_deferred_usd, revenue_ad_usd, revenue_subs_usd, revenue_other_usd,
      input_hash, output_hash, prev_output_hash, raw_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning id`,
    [
      pool.period, pool.eligibleRevenueUSD, pool.poolCeilingUSD, pool.totalBaseUSD, pool.scaleFactor,
      pool.totalAllocatedUSD, pool.totalDeferredUSD,
      revenue.adRevenueUSD, revenue.subsRevenueUSD, revenue.otherRevenueUSD ?? 0,
      inputHash, outputHash, prevHash, pool as any
    ]
  );
  const poolId = ins.rows[0].id;

  for (const r of pool.results) {
    await pg.query(
      `insert into payout_creator_results
       (pool_id, creator_id, base_usd, scaled_usd, diamonds, scale_applied, deferred_usd, flags)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [poolId, r.creatorId, r.baseUSD, r.scaledUSD, r.diamonds, r.scaleApplied, r.deferredUSD, r.flags]
    );
  }

  await pg.end();
  console.log('✅ Pool + results persisted, id =', poolId);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
