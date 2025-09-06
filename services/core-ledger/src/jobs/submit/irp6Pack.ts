import path from 'path';
import { ensureYearArg, YEAR, csv, emit, copyIfExists, zipDir, pgq, paths } from './_shared';

const period = (process.argv[3] || '').toLowerCase(); // "Feb" or "Aug" (optional)
ensureYearArg();

(async () => {
  const { returnsDir, outDir, zipPath } = paths('IRP6');
  const manifest: string[] = [];

  // Simple YTD revenue summary from pools:
  const ytd = await pgq(`
    select date_trunc('month', run_started_at) as month,
           sum(revenue_ad_usd) as ad_usd,
           sum(revenue_subs_usd) as subs_usd,
           sum(revenue_other_usd) as other_usd,
           sum(total_alloc_usd) as payouts_usd
      from payout_pools
     where extract(year from run_started_at) = $1
     group by 1 order by 1 asc
  `, [YEAR]);
  emit(outDir, 'ytd_summary.csv', csv(ytd), manifest);

  // Copy IRP6 PDFs if present
  if (!period || period === 'feb') {
    copyIfExists(path.join(returnsDir, 'IRP6-Feb.pdf'), outDir, manifest);
  }
  if (!period || period === 'aug') {
    copyIfExists(path.join(returnsDir, 'IRP6-Aug.pdf'), outDir, manifest);
  }

  emit(outDir, 'MANIFEST.txt', manifest.join('\n') + '\n', manifest);
  await zipDir(outDir, zipPath);

  console.log('✅ IRP6 pack ready →', zipPath);
})();
