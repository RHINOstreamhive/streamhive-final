import Fastify from "fastify";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const PORT = Number(process.env.LEDGER_PORT || 7101);
const DATA_FILE = process.env.LEDGER_DATA_FILE || path.resolve("./data/ledger.json");

type Receipt = {
  id: string;
  ref: string;
  reason: string;
  from_user_id: string;
  to_user_id: string;
  gross_cents: number;
  net_cents: number;
  fee_cents: number;
  created_at: string; // ISO
};

type Snapshot = {
  balances: Record<string, number>;
  receipts: Receipt[];
  version: 1;
};

const f = Fastify({ logger: true });
await f.register(cors, { origin: true });

/** ---------- In-memory state ---------- */
const balances = new Map<string, number>();
const receipts: Receipt[] = [];

/** ---------- Persistence helpers ---------- */
async function ensureDir(p: string) {
  try { await fs.mkdir(path.dirname(p), { recursive: true }); } catch {}
}

function toSnapshot(): Snapshot {
  const b: Record<string, number> = {};
  for (const [k, v] of balances.entries()) b[k] = v;
  return { balances: b, receipts: [...receipts], version: 1 };
}

async function save() {
  await ensureDir(DATA_FILE);
  const tmp = DATA_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(toSnapshot()), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

async function load() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const snap = JSON.parse(raw) as Snapshot;
    Object.entries(snap.balances || {}).forEach(([k, v]) => balances.set(k, Number(v) || 0));
    (snap.receipts || []).forEach(r => receipts.push(r));
    f.log.info({ DATA_FILE }, "ledger state loaded");
  } catch (e: any) {
    f.log.warn({ DATA_FILE, err: String(e) }, "no prior ledger state, starting fresh");
  }
}

/** ---------- Utils ---------- */
const getBal = (id: string) => balances.get(id) ?? 0;
const setBal = (id: string, v: number) => balances.set(id, v);
function cents(n: number) {
  if (!Number.isFinite(n)) throw new Error("invalid cents");
  return Math.trunc(n);
}

/** ---------- Routes ---------- */
f.get("/health", async () => ({ ok: true }));

// wallet balance
f.get<{ Params: { userId: string } }>("/wallets/:userId/balance", async (req) => {
  const { userId } = req.params;
  return { userId, balance_cents: getBal(userId) };
});

// creator receipts (last 200)
f.get<{ Params: { creatorId: string } }>("/creators/:creatorId/receipts", async (req) => {
  const { creatorId } = req.params;
  const mine = receipts.filter(r => r.to_user_id === creatorId).slice(-200);
  return { ok: true, receipts: mine };
});

// creator monthly earnings (gross)
f.get<{ Params: { creatorId: string } }>("/creators/:creatorId/monthly-earnings", async (req) => {
  const { creatorId } = req.params;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const iso = monthStart.toISOString();

  let gross = 0;
  for (const r of receipts) {
    if (r.to_user_id !== creatorId) continue;
    if (r.created_at >= iso) gross += r.gross_cents;
  }
  return { ok: true, gross_cents: gross };
});

// transfer with fee_bps
f.post<{
  Body: {
    ref: string;
    from_user_id: string;
    to_user_id: string;
    amount_cents: number;
    reason: string;
    fee_bps: number; // 0..10000
  }
}>("/transfer", async (req) => {
  const { ref, from_user_id, to_user_id, amount_cents, reason, fee_bps } = req.body;

  const amt = cents(amount_cents);
  const bps = Math.max(0, Math.min(10000, Math.trunc(fee_bps)));

  const fee = Math.trunc((amt * bps) / 10000);
  const net = amt - fee;

  // Debit payer
  setBal(from_user_id, getBal(from_user_id) - amt);

  // Credit creator
  setBal(to_user_id, getBal(to_user_id) + net);

  // Credit platform fee bucket if any fee
  if (fee > 0) setBal("platform:fees", getBal("platform:fees") + fee);

  const rcpt: Receipt = {
    id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ref,
    reason,
    from_user_id,
    to_user_id,
    gross_cents: amt,
    net_cents: net,
    fee_cents: fee,
    created_at: new Date().toISOString(),
  };
  receipts.push(rcpt);

  await save();
  return { ok: true, fee_cents: fee };
});

// --- Dev/admin helpers ---
f.post("/admin/save", async () => { await save(); return { ok: true, file: DATA_FILE }; });
f.post("/admin/clear", async () => {
  balances.clear();
  receipts.length = 0;
  await save();
  return { ok: true, cleared: true };
});

/** ---------- Boot ---------- */
await load();

f.addHook("onClose", async () => { try { await save(); } catch {} });

f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => {
  f.log.error(e);
  process.exit(1);
});