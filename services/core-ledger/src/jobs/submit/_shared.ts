import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { stringify } from 'csv-stringify/sync';

export const YEAR = Number(process.argv[2] || new Date().getFullYear());

export function ensureYearArg() {
  if (!Number.isInteger(YEAR)) {
    console.error('Usage: ts-node --esm src/jobs/submit/<pack>.ts <YEAR> [EXTRA]');
    process.exit(1);
  }
}

export function sha256(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function csv(rows: any[], header = true) {
  return stringify(rows, { header });
}

export async function zipDir(srcDir: string, destZip: string) {
  await new Promise<void>((resolve, reject) => {
    fs.mkdirSync(path.dirname(destZip), { recursive: true });
    const output = fs.createWriteStream(destZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

export function emit(dir: string, name: string, data: string | Buffer, manifest: string[]) {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  manifest.push(`${sha256(data)}  ${name}`);
}

export function copyIfExists(srcFile: string, destDir: string, manifest: string[]) {
  if (fs.existsSync(srcFile)) {
    const data = fs.readFileSync(srcFile);
    emit(destDir, path.basename(srcFile), data, manifest);
  }
}

export function copyDirIfExists(srcDir: string, destDir: string, manifest: string[]) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir)) {
    const full = path.join(srcDir, entry);
    if (fs.statSync(full).isDirectory()) {
      const subManifest: string[] = [];
      copyDirIfExists(full, path.join(destDir, path.basename(full)), subManifest);
      // Write a MANIFEST for subfolder too
      if (subManifest.length) emit(path.join(destDir, path.basename(full)), 'MANIFEST.txt', subManifest.join('\n') + '\n', manifest);
    } else {
      const data = fs.readFileSync(full);
      emit(destDir, entry, data, manifest);
    }
  }
}

export async function pgq<T = any>(sql: string, params: any[] = [], pool?: Pool): Promise<T[]> {
  const pg = pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pg.query(sql, params);
  if (!pool) await pg.end();
  return r.rows as T[];
}

export function paths(type: string) {
  const base = path.resolve(__dirname, '../../../');
  const returnsDir = path.join(base, 'returns', String(YEAR), type);
  const outDir = path.join(base, 'submissions', String(YEAR), type);
  const zipPath = path.join(outDir, 'pack.zip');
  return { base, returnsDir, outDir, zipPath };
}
