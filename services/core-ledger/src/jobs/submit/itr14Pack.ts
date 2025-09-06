import fs from 'fs';
import path from 'path';
import { ensureYearArg, YEAR, csv, emit, copyIfExists, copyDirIfExists, zipDir, pgq, paths } from './_shared';

ensureYearArg();

(async () => {
  const { returnsDir, outDir, zipPath } = paths('ITR14');
  const manifest: string[] = [];

  // 1) Pull evidence from DB (payout tables)
  const pools = await pgq(`
    select id, period, run_started_at, eligible_revenue as eligible_revenue_usd,
           pool_ceiling_usd, total_base_usd, scale_factor, total_alloc_usd,
           total_deferred_usd, revenue_ad_usd, revenue_subs_usd, revenue_other_usd
      from payout_pools
     where extract(year from run_started_at) = $1
     order by run_started_at asc
  `, [YEAR]);

  const results = pools.length ? await pgq(`
    select pool_id, creator_id, base_usd, scaled_usd, diamonds, scale_applied, deferred_usd, flags
      from payout_creator_results
     where pool_id = any ($1)
     order by pool_id asc, creator_id asc
  `, [pools.map((p: any) => p.id)]) : [];

  const settlements = pools.length ? await pgq(`
    select pool_id, creator_id, diamonds_credited, usd_equiv, ledger_tx_id, status, settled_at
      from creator_settlements
     where pool_id = any ($1)
     order by settled_at asc
  `, [pools.map((p: any) => p.id)]) : [];

  const audits = await pgq(`
    select actor, action, ref_type, ref_id, details, created_at
      from audit_events
     where extract(year from created_at) = $1
     order by created_at asc
  `, [YEAR]);

  // 2) Emit CSVs
  emit(outDir, 'payout_pools.csv',    csv(pools), manifest);
  emit(outDir, 'payout_results.csv',  csv(results), manifest);
  emit(outDir, 'settlements.csv',     csv(settlements), manifest);
  emit(outDir, 'audit_events.csv',    csv(audits), manifest);

  // 3) Copy official PDFs if present (you save them into returns/<YEAR>/ITR14/)
  copyIfExists(path.join(returnsDir, 'AFS.pdf'), outDir, manifest);
  copyIfExists(path.join(returnsDir, 'ITA34.pdf'), outDir, manifest);
  copyIfExists(path.join(returnsDir, 'TaxComputation.pdf'), outDir, manifest);

  // 4) Optional: include any extra supporting docs under ITR14/
  copyDirIfExists(path.join(returnsDir, 'supporting_docs'), path.join(outDir, 'supporting_docs'), manifest);

  // 5) Write MANIFEST and ZIP
  emit(outDir, 'MANIFEST.txt', manifest.join('\n') + '\n', manifest);
  await zipDir(outDir, zipPath);

  console.log('✅ ITR14 pack ready →', zipPath);
})();
