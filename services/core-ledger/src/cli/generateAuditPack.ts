// services/core-ledger/src/cli/generateAuditPack.ts
// Builds CSV reports, (optionally) pulls SARS PDFs via IMAP, then calls New-AuditPack.ps1 to zip + index + hash.

import * as dotenv from "dotenv";
import path from "path";
import fs from "fs-extra";
import dayjs from "dayjs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createObjectCsvWriter } from "csv-writer";

// ---- ESM dirname shim
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Hard-coded .env path (Option B)
dotenv.config({
  path:
    "C:\\Users\\27768\\Downloads\\streamhive-final-sprint1\\streamhive-final\\services\\core-ledger\\.env",
});

// ---------- CLI args ----------
const argv = yargs(hideBin(process.argv))
  .option("from", { type: "string", demandOption: true })
  .option("to", { type: "string", demandOption: true })
  .option("client", { type: "string", default: "streamhive" })
  .option("scope", { type: "string", default: "ITR14" })
  .parseSync();

const FROM = argv.from;
const TO = argv.to;
const CLIENT = argv.client;
const SCOPE = argv.scope;

// ---------- paths ----------
const projectRoot = path.resolve(__dirname, "../../.."); // -> services/core-ledger
const outBase = path.resolve(projectRoot, "out");
const packRoot = path.join(outBase, CLIENT, `${FROM}_${TO}`, SCOPE);
const psAuditPack = path.resolve(outBase, "New-AuditPack.ps1");

// ---------- optional DB (not used yet; kept for future) ----------
import { Client as PgClient } from "pg";

async function tryGetTransactions(): Promise<
  Array<{ date: string; account: string; description: string; debit: number; credit: number }>
> {
  // if any PG env var is missing, fall back to demo data
  const hasPgEnv =
    !!process.env.PGHOST &&
    !!process.env.PGPORT &&
    !!process.env.PGUSER &&
    !!process.env.PGPASSWORD &&
    !!process.env.PGDATABASE;

  if (!hasPgEnv) return demoTransactions();

  const pg = new PgClient();
  try {
    await pg.connect();
    const sql = `
      SELECT
        posted_at::date                     AS date,
        account                             AS account,
        COALESCE(description, '')           AS description,
        COALESCE(debit, 0)::numeric::float8  AS debit,
        COALESCE(credit,0)::numeric::float8  AS credit
      FROM transactions
      WHERE posted_at >= $1 AND posted_at <= $2
      ORDER BY posted_at, account;
    `;
    const res = await pg.query(sql, [FROM, TO]);
    return res.rows.map((r: any) => ({
      date: dayjs(r.date).format("YYYY-MM-DD"),
      account: r.account,
      description: r.description,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    }));
  } catch (e) {
    console.warn("[reports] DB fetch failed; using demo data. Error:", (e as Error).message);
    return demoTransactions();
  } finally {
    try {
      await pg.end();
    } catch {}
  }
}

function demoTransactions() {
  return [
    { date: FROM, account: "1000-Sales", description: "Demo sale", debit: 0, credit: 1000 },
    { date: FROM, account: "5000-COGS", description: "Demo cogs", debit: 400, credit: 0 },
    { date: TO, account: "6100-Rent", description: "Demo rent", debit: 300, credit: 0 },
    { date: TO, account: "1100-Cash", description: "Demo cash", debit: 300, credit: 0 },
  ];
}

// ---------- CSV writers ----------
async function writeLedgerCSV(rows: any[], filePath: string) {
  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "date", title: "date" },
      { id: "account", title: "account" },
      { id: "description", title: "description" },
      { id: "debit", title: "debit" },
      { id: "credit", title: "credit" },
    ],
  });
  await writer.writeRecords(rows);
}

function aggregateByAccount(rows: any[]) {
  const map = new Map<string, { account: string; debit: number; credit: number }>();
  for (const r of rows) {
    const key = r.account;
    const prev = map.get(key) || { account: key, debit: 0, credit: 0 };
    prev.debit += Number(r.debit) || 0;
    prev.credit += Number(r.credit) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.account.localeCompare(b.account));
}

async function writeTrialBalanceCSV(rows: any[], filePath: string) {
  const agg = aggregateByAccount(rows).map((r) => ({
    account: r.account,
    debit: r.debit.toFixed(2),
    credit: r.credit.toFixed(2),
    balance: (r.debit - r.credit).toFixed(2),
  }));
  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "account", title: "account" },
      { id: "debit", title: "debit" },
      { id: "credit", title: "credit" },
      { id: "balance", title: "balance" },
    ],
  });
  await writer.writeRecords(agg);
}

async function writeIncomeStatementCSV(rows: any[], filePath: string) {
  let sales = 0,
    cogs = 0,
    opex = 0;
  for (const r of rows) {
    const acct = String(r.account).toLowerCase();
    if (acct.includes("sales") || acct.startsWith("4") || acct.startsWith("1")) {
      sales += Number(r.credit) - Number(r.debit);
    } else if (acct.includes("cogs") || acct.startsWith("5")) {
      cogs += Number(r.debit) - Number(r.credit);
    } else {
      opex += Number(r.debit) - Number(r.credit);
    }
  }
  const grossProfit = sales - cogs;
  const netProfit = grossProfit - opex;

  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "line", title: "line" },
      { id: "amount", title: "amount" },
    ],
  });
  await writer.writeRecords([
    { line: "Revenue", amount: sales.toFixed(2) },
    { line: "COGS", amount: cogs.toFixed(2) },
    { line: "Gross Profit", amount: grossProfit.toFixed(2) },
    { line: "Operating Expenses", amount: opex.toFixed(2) },
    { line: "Net Profit", amount: netProfit.toFixed(2) },
  ]);
}

async function writeBalanceSheetCSV(rows: any[], filePath: string) {
  const agg = aggregateByAccount(rows);
  let assets = 0,
    liabilities = 0,
    equity = 0;
  for (const r of agg) {
    if (r.account.startsWith("1")) assets += r.debit - r.credit;
    else if (r.account.startsWith("2")) liabilities += r.credit - r.debit;
    else if (r.account.startsWith("3")) equity += r.credit - r.debit;
  }
  const writer = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "line", title: "line" },
      { id: "amount", title: "amount" },
    ],
  });
  await writer.writeRecords([
    { line: "Assets", amount: assets.toFixed(2) },
    { line: "Liabilities", amount: liabilities.toFixed(2) },
    { line: "Equity", amount: equity.toFixed(2) },
    { line: "Assets - Liabilities - Equity", amount: (assets - liabilities - equity).toFixed(2) },
  ]);
}

// ---------- main ----------
(async () => {
  await fs.ensureDir(packRoot);

  const txns = await tryGetTransactions();

  // Write CSVs
  const ledgerCsv = path.join(packRoot, "LedgerSummary.csv");
  const tbCsv = path.join(packRoot, "TrialBalance.csv");
  const isCsv = path.join(packRoot, "IncomeStatement.csv");
  const bsCsv = path.join(packRoot, "BalanceSheet.csv");
  await writeLedgerCSV(txns, ledgerCsv);
  await writeTrialBalanceCSV(txns, tbCsv);
  await writeIncomeStatementCSV(txns, isCsv);
  await writeBalanceSheetCSV(txns, bsCsv);

  console.log("[reports] wrote:");
  console.log(" -", ledgerCsv);
  console.log(" -", tbCsv);
  console.log(" -", isCsv);
  console.log(" -", bsCsv);

  // === Optional: pull SARS PDFs via IMAP into the same folder ===
  if (process.env.IMAP_USER && process.env.IMAP_PASS) {
    const { spawnSync } = await import("node:child_process");
    const tsNode = process.platform === "win32" ? "npx.cmd" : "npx";
    const fetchPath = path.resolve(projectRoot, "src/cli/fetchMailDocs.ts");

    const r = spawnSync(
      tsNode,
      [
        "ts-node",
        fetchPath,
        "--out",
        packRoot,
        "--since",
        FROM,
        "--from",
        "no-reply@sars.gov.za", // change/clear as you like
      ],
      { stdio: "inherit" }
    );

    if (r.status !== 0) {
      console.warn("fetchMailDocs: non-zero exit, continuing without email PDFs");
    }
  }

  // === Call PowerShell packer ===
  const { spawnSync } = await import("node:child_process");
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psAuditPack,
      "-Client",
      CLIENT,
      "-From",
      FROM,
      "-To",
      TO,
      "-Scope",
      SCOPE,
    ],
    { stdio: "inherit" }
  );

  if (ps.status !== 0) {
    console.error("New-AuditPack.ps1 failed. Exit:", ps.status);
    process.exit(ps.status || 1);
  } else {
    console.log("\n✅ Audit pack built and sealed.");
    console.log("Folder:", packRoot);
  }
})();
