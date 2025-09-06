import Fastify from "fastify";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";
import { z } from "zod";
import crypto from "crypto";

dotenv.config();

const PORT = Number(process.env.PORT || 7400);
const INTERNAL_SHARED_SECRET = process.env.INTERNAL_SHARED_SECRET || "";

const f = Fastify({ logger: true });
await f.register(cors, { origin: true });

f.get("/health", async () => ({ ok: true }));

// ---- HMAC guard for POSTs ----
function hmac(payload: string) {
  return crypto.createHmac("sha256", INTERNAL_SHARED_SECRET).update(payload).digest("hex");
}

f.addHook("preHandler", async (req, reply) => {
  if (req.method === "POST") {
    if (!INTERNAL_SHARED_SECRET) return; // dev fallback
    const sig = req.headers["x-internal-signature"]; // must match raw JSON body
    const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const expect = hmac(bodyStr);
    if (sig !== expect) {
      f.log.warn({ got: sig, expect }, "fraud hmac failed");
      return reply.status(401).send({ ok: false, error: "unauthorized" });
    }
  }
});

// ---- Schema & Scoring ----
const checkSchema = z.object({
  viewer_id: z.string().min(1),
  action: z.string(),
  amount_cents: z.number().int().nonnegative().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  fp_hash: z.string().optional(),
});

function scoreRisk(input: z.infer<typeof checkSchema>): number {
  let s = 0.01; // base
  if ((input.amount_cents ?? 0) > 50_00) s += 0.15; // > $50 eq
  if (!input.fp_hash) s += 0.05; // no fingerprint
  if (!input.user_agent) s += 0.02; // no UA
  if (input.ip && (input.ip.startsWith("10.") || input.ip.startsWith("192.168.") || input.ip === "127.0.0.1")) {
    s += 0; // private/local ok
  }
  return Math.min(0.99, s);
}

function actionFromScore(s: number): "allow" | "flag" | "deny" {
  if (s < 0.25) return "allow";
  if (s < 0.6) return "flag";
  return "deny";
}

f.post("/check", async (req) => {
  const body = checkSchema.parse(req.body);
  const score = scoreRisk(body);
  const action = actionFromScore(score);
  return { ok: true, score, action };
});

f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => {
  f.log.error(e);
  process.exit(1);
});