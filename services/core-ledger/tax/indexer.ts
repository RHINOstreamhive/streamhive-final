import fg from "fast-glob";
import { statSync } from "fs";
import { writeFileSync } from "fs";
import { join, basename } from "path";

export type Doc = {
  path: string;        // absolute or project-rel
  file: string;        // filename
  size: number;
  mtime: number;       // modified timestamp (ms)
};

export type Index = { docs: Doc[] };

async function run() {
  // Scan these roots
  const roots = [
    join(process.cwd(), "data"),
    join(process.cwd(), "downloads"),         // add more if you like
    join(process.cwd(), "inbox"),             // …
  ];

  const patterns = roots.map(r => `${r.replace(/\\/g, "/")}/**/*.{pdf,csv,docx,xlsx}`);
  const files = await fg(patterns, { dot: false, onlyFiles: true });

  const docs: Doc[] = files.map(p => {
    const st = statSync(p);
    return { path: p, file: basename(p), size: st.size, mtime: st.mtimeMs };
  });

  const out: Index = { docs: docs.sort((a,b) => b.mtime - a.mtime) };
  const indexFile = join(process.cwd(), "data", "index.json");
  writeFileSync(indexFile, JSON.stringify(out, null, 2));
  console.log(`[indexer] wrote ${docs.length} docs → ${indexFile}`);
}

run().catch(err => { console.error(err); process.exit(1); });
