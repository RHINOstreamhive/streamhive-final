import Fastify from "fastify";
    import cors from "@fastify/cors";
    import * as dotenv from "dotenv";
    dotenv.config();
    const PORT = Number(process.env.PORT || 7300);
    const f = Fastify({ logger: true });
    await f.register(cors, { origin: true });
    f.get("/health", async () => ({ ok: true, service: "analytics" }));

import { z } from "zod";
const ev = z.object({ type:z.string(), user_id:z.string().optional(), props:z.record(z.any()).default({}) });
f.post("/ingest", async (req)=>{ const body=ev.parse(req.body); return { ok:true, stored:true }; });

    f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
