import Fastify from "fastify";
    import cors from "@fastify/cors";
    import * as dotenv from "dotenv";
    dotenv.config();
    const PORT = Number(process.env.PORT || 7700);
    const f = Fastify({ logger: true });
    await f.register(cors, { origin: true });
    f.get("/health", async () => ({ ok: true, service: "shorts-service" }));

import { z } from "zod";
const s = z.object({ source_url:z.string(), start:z.number(), duration:z.number().positive() });
f.post("/clip", async (req)=>{ const body=s.parse(req.body); return { ok:true, job_id:"clip-001" }; });

    f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
