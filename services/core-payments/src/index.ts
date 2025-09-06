import Fastify from "fastify"; import cors from "@fastify/cors"; import * as dotenv from "dotenv"; import Stripe from "stripe"; import { z } from "zod";
dotenv.config();
const PORT = Number(process.env.PORT || 7102); const LEDGER_URL = process.env.LEDGER_URL || "http://localhost:7101"; const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" }); const f = Fastify({ logger: true }); await f.register(cors, { origin: true });
f.get("/health", async()=>({ok:true}));
const purchase = z.object({ user_id:z.string(), diamonds:z.number().int().positive(), currency:z.string().default("usd") });
f.post("/diamonds/purchase", async (req)=>{ const b=purchase.parse(req.body); const amount_cents=b.diamonds; const intent=await stripe.paymentIntents.create({ amount: amount_cents, currency: b.currency, automatic_payment_methods:{enabled:true}, metadata:{ user_id:b.user_id, kind:"diamonds_topup", diamonds:String(b.diamonds) } }); return { client_secret:intent.client_secret, payment_intent:intent.id }; });
f.post("/webhook/stripe", async (req)=>{ let event:any = typeof req.body === "string" ? JSON.parse(req.body) : req.body; if (event?.type==="payment_intent.succeeded"){ const intent = event.data.object; const userId=intent.metadata?.user_id; const diamonds=parseInt(intent.metadata?.diamonds || "0",10); if (userId && diamonds>0){ await fetch(`${LEDGER_URL}/wallets/${encodeURIComponent(userId)}/credit`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ amount_cents: diamonds, reason:"diamonds_topup", ref:intent.id, meta:{ provider:"stripe" } }) }); } } return { received:true }; });
f.listen({ port: PORT, host: "0.0.0.0" }).catch((e)=>{ f.log.error(e); process.exit(1); });
