import Fastify from "fastify"; import cors from "@fastify/cors"; import * as dotenv from "dotenv"; import { z } from "zod"; import crypto from "crypto";
dotenv.config();
const PORT = Number(process.env.PORT || 7005); const f = Fastify({ logger: true }); await f.register(cors, { origin: true });
f.get("/health", async()=>({ok:true}));
const loginReq = z.object({ email:z.string().email() });
f.post("/auth/magic", async (req)=>{ const { email } = loginReq.parse(req.body); const token = crypto.randomBytes(16).toString("hex"); return { ok:true, token, note:"DEV: send this as a magic link" }; });
f.post("/auth/2fa/setup", async ()=>({ ok:true, secret:"otpauth://totp/StreamHive:demo?secret=BASE32" }));
f.listen({ port: PORT, host: "0.0.0.0" }).catch((e)=>{ f.log.error(e); process.exit(1); });
