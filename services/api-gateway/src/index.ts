import Fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const PORT = Number(process.env.API_PORT || 7100);

// Internal service URLs
const LEDGER_URL = process.env.LEDGER_URL || "http://localhost:7101";
const FRAUD_URL  = process.env.FRAUD_URL  || "http://localhost:7400";
const NOTIF_URL  = process.env.NOTIF_URL  || "http://localhost:7500";

// Optional shared-secret to Fraud (we won't enforce on Ledger)
const INTERNAL_SHARED_SECRET = process.env.INTERNAL_SHARED_SECRET || "";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

async function postJson<T>(url: string, body: any, opts: RequestInit = {}): Promise<T> {
  const raw = JSON.stringify(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    body: raw,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method || "POST"} ${url} -> ${res.status} ${res.statusText}\n${text}`);
  }
  return (await res.json()) as T;
}
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}\n${text}`);
  }
  return (await res.json()) as T;
}

function hmacSha256(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Fraud call */
async function fraudCheck(req: FastifyRequest, args: {
  viewer_id: string;
  action: "tip";
  amount_cents?: number;
}) {
  const payload = {
    viewer_id: args.viewer_id,
    action: args.action,
    amount_cents: args.amount_cents,
    ip: (req.headers["x-forwarded-for"] as string) || (req as any).ip,
    user_agent: (req.headers["user-agent"] as string) || undefined,
  };

  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (INTERNAL_SHARED_SECRET) headers["x-internal-signature"] = hmacSha256(INTERNAL_SHARED_SECRET, raw);

  const res = await fetch(`${FRAUD_URL}/check`, { method: "POST", headers, body: raw });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : undefined; } catch {}

  if (!res.ok) throw new Error(`POST ${FRAUD_URL}/check -> ${res.status} ${res.statusText}\n${text}`);

  const action = json?.action as "allow" | "flag" | "deny" | undefined;
  const score  = json?.score as number | undefined;
  if (!action) throw new Error(`fraud_malformed_response: ${text}`);

  return { action, score };
}

/** Fee tiers based on creator monthly gross (USD cents) */
function feeBpsForMonthlyGross(gross_cents: number): number {
  // < $1k  => 5% (500 bps)
  // $1k–$10k => 10% (1000 bps)
  // $10k+ => 15% (1500 bps)
  if (gross_cents < 100_000) return 500;
  if (gross_cents < 1_000_000) return 1000;
  return 1500;
}

app.get("/health", async () => ({ ok: true }));

// Tip only (subscribe removed)
app.post<{ Body: { from_user_id: string; to_user_id: string; amount_cents: number } }>(
  "/tip",
  async (req, reply) => {
    const { from_user_id, to_user_id, amount_cents } = req.body;

    // 1) Fraud-light
    const fraud = await fraudCheck(req, { viewer_id: from_user_id, action: "tip", amount_cents });
    if (fraud.action === "deny") {
      return reply.code(401).send({ ok: false, error: "fraud_denied", fraud });
    }

    // 2) Pull creator MTD gross from Ledger and choose fee tier
    type MtdResp = { ok: true; gross_cents: number };
    const mtd = await getJson<MtdResp>(`${LEDGER_URL}/creators/${encodeURIComponent(to_user_id)}/monthly-earnings`);
    const fee_bps = feeBpsForMonthlyGross(mtd.gross_cents);

    // 3) Transfer with selected fee
    const ref = `tip-${Date.now()}-${from_user_id}-${to_user_id}`;
    const result = await postJson<{ ok: boolean; fee_cents: number }>(`${LEDGER_URL}/transfer`, {
      ref,
      from_user_id,
      to_user_id,
      amount_cents,
      reason: "tip",
      fee_bps,
    });

    // 4) Notify overlay
    const dollars = (amount_cents / 100).toFixed(2);
    await postJson(`${NOTIF_URL}/send`, {
      kind: "creator_event",
      to: to_user_id,
      message: ` Tip from ${from_user_id}: $${dollars}`,
    });

    return { ok: true, result, ref, fraud, applied_fee_bps: fee_bps, mtd_gross_before_cents: mtd.gross_cents };
  }
);

// NEW: Creator summary — fee tier + balances for dashboards/overlay
app.get<{ Params: { id: string } }>("/creator/:id/summary", async (req) => {
  const id = req.params.id;

  const mtd = await getJson<{ ok: true; gross_cents: number }>(`${LEDGER_URL}/creators/${encodeURIComponent(id)}/monthly-earnings`);
  const fee_bps = feeBpsForMonthlyGross(mtd.gross_cents);

  const bal = await getJson<{ userId: string; balance_cents: number }>(`${LEDGER_URL}/wallets/${encodeURIComponent(id)}/balance`);

  return {
    ok: true,
    creator_id: id,
    mtd_gross_cents: mtd.gross_cents,
    applied_fee_bps: fee_bps,
    wallet_balance_cents: bal.balance_cents,
  };
});

app.listen({ host: "0.0.0.0", port: PORT }, () => {
  console.log(`api-gateway listening on ${PORT}`);
});