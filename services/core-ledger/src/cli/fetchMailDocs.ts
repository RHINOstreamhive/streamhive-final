// services/core-ledger/src/cli/fetchMailDocs.ts
// Pulls PDF attachments from IMAP into a destination folder.

import * as dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// ---- ESM dirname shim
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Hard-coded .env path (Option B)
dotenv.config({
  path:
    "C:\\Users\\27768\\Downloads\\streamhive-final-sprint1\\streamhive-final\\services\\core-ledger\\.env",
});

const argv = yargs(hideBin(process.argv))
  .option("out", { type: "string", demandOption: true }) // destination folder
  .option("since", { type: "string", default: "2024-01-01" })
  .option("from", { type: "string", default: "" }) // optional sender filter
  .parseSync();

const OUT_DIR = argv.out;
const SINCE = argv.since;
const FROM = argv.from;

const { IMAP_HOST, IMAP_PORT, IMAP_TLS, IMAP_USER, IMAP_PASS, IMAP_FOLDER } = process
  .env as Record<string, string>;

function must(name: string, v?: string) {
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

async function main() {
  await fs.ensureDir(OUT_DIR);

  const client = new ImapFlow({
    host: must("IMAP_HOST", IMAP_HOST),
    port: Number(IMAP_PORT ?? 993),
    secure: String(IMAP_TLS ?? "true").toLowerCase() !== "false",
    auth: { user: must("IMAP_USER", IMAP_USER), pass: must("IMAP_PASS", IMAP_PASS) },
  });

  await client.connect();
  const mailbox = await client.mailboxOpen(IMAP_FOLDER || "INBOX");

  const criteria: any[] = [["SINCE", new Date(SINCE)]];
  if (FROM) criteria.push(["FROM", FROM]);

  let downloaded = 0;

  for await (const msg of client.fetch(criteria, { source: true, envelope: true })) {
    const parsed = await simpleParser(msg.source as Buffer);
    if (!parsed.attachments?.length) continue;

    for (const a of parsed.attachments) {
      if (!a.filename) continue;
      const lower = a.filename.toLowerCase();
      if (!lower.endsWith(".pdf")) continue;

      const dest = path.join(OUT_DIR, a.filename);
      await fs.writeFile(dest, a.content as Buffer);
      downloaded++;
      console.log("Saved:", dest);
    }
  }

  await client.logout();
  console.log(downloaded ? `✅ ${downloaded} PDF(s) saved.` : "No PDFs found.");
}

main().catch((err) => {
  console.error("fetchMailDocs failed:", err.message);
  process.exit(1);
});
