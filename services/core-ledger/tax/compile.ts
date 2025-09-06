import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import archiver from "archiver";
import { REQUIREMENTS, Scope } from "./requirements.js";

type IndexDoc = { path: string; file: string; mtime: number; size: number; };
type Index = { docs: IndexDoc[] };

function parseArgs() {
  const args = process.argv.slice(2);
  const out: any = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, "");
    out[k] = args[i+1];
  }
  if (!out.from || !out.to || !out.scope || !out.client) {
    console.error(`Usage: ts-node --esm src/tax/compile.ts --from 2025-01-01 --to 2025-12-31 --scope ITR14 --client "H"`);
    process.exit(1);
  }
  return out as { from: string; to: string; scope: Scope; client: string; };
}

function withinRange(ts: number, from: Date, to: Date) {
  return ts >= from.getTime() && ts <= to.getTime();
}

function matchRequirement(file: string, reqPatterns: RegExp[]) {
  return reqPatterns.some(rx => rx.test(file));
}

async function main() {
  const { from, to, scope, client } = parseArgs();
  const fromD = new Date(from);
  const toD   = new Date(to);
  const indexPath = join(process.cwd(), "data", "index.json");
  if (!existsSync(indexPath)) {
    console.error(`Index not found: ${indexPath}. Run: npm run tax:index`);
    process.exit(2);
  }
  const idx: Index = JSON.parse(readFileSync(indexPath, "utf8"));
  const inRange = idx.docs.filter(d => withinRange(d.mtime, fromD, toD));

  // naive “by client”: include if filename or parent path contains client token
  const token = client.toLowerCase();
  const mine = inRange.filter(d => d.path.toLowerCase().includes(token) || d.file.toLowerCase().includes(token) );

  // group by requirement
  const reqs = REQUIREMENTS[scope];
  const selected: Record<string, IndexDoc[]> = {};
  for (const r of reqs) {
    selected[r.key] = mine.filter(d => matchRequirement(d.file, r.patterns));
  }

  // compute missing
  const missing: { key: string; label: string; need: number; have: number; optional?: boolean }[] = [];
  for (const r of reqs) {
    const have = selected[r.key]?.length || 0;
    const need = r.minCount ?? 1;
    if (have < need && !r.optional) {
      missing.push({ key: r.key, label: r.label, need, have });
    }
  }

  // output folder
  const outDir = join(process.cwd(), "out", client, `${from}_${to}`, scope);
  mkdirSync(outDir, { recursive: true });

  // cover + manifest
  const cover = [
    `SARS Audit Pack`,
    `Client      : ${client}`,
    `Scope       : ${scope}`,
    `Period      : ${from} → ${to}`,
    `Generated   : ${new Date().toISOString()}`,
    `Missing     : ${missing.length ? "YES" : "NO"}`,
    ``,
    `Included files are organised by requirement keys.`,
  ].join("\n");
  writeFileSync(join(outDir, "COVER.txt"), cover, "utf8");

  const manifest = {
    client, scope, from, to,
    counts: Object.fromEntries(
      reqs.map(r => [r.key, selected[r.key]?.length || 0])
    ),
    missing,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // build the zip
  const zipName = `AuditPack-${client}-${from}-${to}-${scope}.zip`;
  const zipPath = join(outDir, zipName);
  const output = require("fs").createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", reject);
  });

  archive.pipe(output);

  // add cover + manifest
  archive.file(join(outDir, "COVER.txt"), { name: "COVER.txt" });
  archive.file(join(outDir, "manifest.json"), { name: "manifest.json" });

  // add matched files into folders by requirement key
  for (const r of reqs) {
    const files = selected[r.key] || [];
    for (const f of files) {
      archive.file(f.path, { name: `${r.key}/${basename(f.path)}` });
    }
  }

  // if missing, include a Missing.txt
  if (missing.length) {
    const miss = missing.map(m => `- ${m.label} (need ${m.need}, have ${m.have})`).join("\n");
    archive.append(miss, { name: "MISSING.txt" });
  }

  await archive.finalize();
  await done;

  console.log(`✅ Wrote ${zipPath}`);
  if (missing.length) {
    console.warn(`⚠️ Missing required items:\n${missing.map(m => `- ${m.label}`).join("\n")}`);
    process.exitCode = 3; // non-fatal, but visible
  }
}

main().catch(err => { console.error(err); process.exit(1); });
