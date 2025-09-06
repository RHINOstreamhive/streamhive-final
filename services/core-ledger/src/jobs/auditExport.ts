/**
 * SARS Audit Bundle Exporter (v1)
 * ---------------------------------------------------------------------------
 * Purpose: Generate a single, audit‑ready ZIP for a given YEAR that contains
 * CSVs + JSON + a MANIFEST of SHA‑256 hashes. Designed to satisfy deep audits.
 *
 * Run:
 *   # inside services/core-ledger
 *   npm i archiver csv-stringify dotenv pg
 *   npx ts-node --esm src/jobs/auditExport.ts 2024
 *
 * Output:
 *   services/core-ledger/exports/SARS_Audit_2024.zip
 *   ZIP contains:
 *     - revenue.csv
 *     - payout_pools.csv
 *     - payout_results.csv
 *     - settlements.csv
 *     - fx_rates.csv
 *     - audit_events.csv
 *     - pools_raw.jsonl (one JSON per line)
 *     - MANIFEST.txt (filename + SHA‑256)
 *
 * Storage recommendation:
 *   Upload the ZIP to S3 with Object Lock (WORM) + 7‑year retention + versioning.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { stringify } from 'csv-stringify/sync';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YEAR = Number(process.argv[2] || new Date().getFullYear());
if (!Number.isInteger(YEAR)) {
  console.error('Usage: ts-node --esm src/jobs/auditExport.ts <YEAR>');
  process.exit(1);
}

const pg = new Pool({ connectionString: process.env.DATABASE_URL });

function sha256(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function writeFile(p: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

function csv(rows: any[], header = true) {
  return stringify(rows, { header });
}

async function query(sql: string, params: any[] = []) {
  const r = await pg.query(sql, params);
  return r.rows;
}

async function main() {
  // ----- Prepare working dir -----
  const outRoot = path.resolve(__dirname, '../../exports/tmp');
  const outDir = path.join(outRoot, `SARS_${YEAR}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // ----- Queries -----
  const pools = await query(
    `select id, period, run_started_at, eligible_revenue as eligible_revenue_usd,
            pool_ceiling_usd, total_base_usd, scale_factor, total_alloc_usd,
            total_deferred_usd, revenue_ad_usd, revenue_subs_usd, revenue_other_usd,
            fx_rate_usdzar, input_hash, output_hash, prev_output_hash, raw_json
       from payout_pools
      where extract(year from run_started_at) = $1
      order by run_started_at asc`,
    [YEAR]
  );

  const poolIds = pools.map(p => p.id);
  const inList = poolIds.length ? `(${poolIds.map((_,i)=>`$${i+2}`).join(',')})` : '(null)';

  const results = poolIds.length
    ? await query(
        `select pool_id, creator_id, base_usd, scaled_usd, diamonds,
                scale_applied, deferred_usd, flags
           from payout_creator_results
          where pool_id in ${inList}
          order by pool_id asc, creator_id asc`,
        [YEAR, ...poolIds]
      )
    : [];

  const settlements = poolIds.length
    ? await query(
        `select pool_id, creator_id, diamonds_credited, usd_equiv, ledger_tx_id,
                status, settled_at
           from creator_settlements
          where pool_id in ${inList}
          order by settled_at asc`,
        [YEAR, ...poolIds]
      )
    : [];

  const revenue = await query(
    `select date_trunc('day', run_started_at) as day,
            sum(revenue_ad_usd) as ad_usd,
            sum(revenue_subs_usd) as subs_usd,
            sum(revenue_other_usd) as other_usd
       from payout_pools
      where extract(year from run_started_at) = $1
      group by 1
      order by 1 asc`,
    [YEAR]
  );

  const fxRates = await query(
    `select run_started_at, fx_rate_usdzar
       from payout_pools
      where extract(year from run_started_at) = $1
        and fx_rate_usdzar is not null
      order by run_started_at asc`,
    [YEAR]
  );

  const audits = await query(
    `select actor, action, ref_type, ref_id, details, created_at
       from audit_events
      where extract(year from created_at) = $1
      order by created_at asc`,
    [YEAR]
  );

  // ----- Write files -----
  const manifest: string[] = [];
  function emit(name: string, data: string | Buffer) {
    const p = path.join(outDir, name);
    writeFile(p, data);
    const hash = sha256(data);
    manifest.push(`${hash}  ${name}`);
  }

  // CSVs
  emit('payout_pools.csv',  csv(pools));
  emit('payout_results.csv', csv(results));
  emit('settlements.csv',   csv(settlements));
  emit('revenue.csv',       csv(revenue));
  emit('fx_rates.csv',      csv(fxRates));
  emit('audit_events.csv',  csv(audits));

  // Raw JSON Lines (for exact reproduction)
  const rawJsonl = pools.map(p => JSON.stringify(p.raw_json)).join('\n');
  emit('pools_raw.jsonl', rawJsonl);

  // MANIFEST
  emit('MANIFEST.txt', manifest.join('\n') + '\n');

  // ----- Zip up -----
  const zipName = `SARS_Audit_${YEAR}.zip`;
  const zipPath = path.resolve(__dirname, '../../exports', zipName);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(outDir, false);
    archive.finalize();
  });

  const zipBuf = fs.readFileSync(zipPath);
  const zipHash = sha256(zipBuf);
  console.log(`✅ Created ${zipPath} (sha256=${zipHash})`);

  await pg.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
