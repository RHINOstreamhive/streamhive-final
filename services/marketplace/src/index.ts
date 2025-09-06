import Fastify from "fastify";
    import cors from "@fastify/cors";
    import * as dotenv from "dotenv";
    dotenv.config();
    const PORT = Number(process.env.PORT || 7801);
    const f = Fastify({ logger: true });
    await f.register(cors, { origin: true });
    f.get("/health", async () => ({ ok: true, service: "marketplace" }));

import { z } from "zod";
const m = z.object({ creator_id:z.string(), price_cents:z.number().int().positive(), title:z.string() });
f.post("/mint", async (req)=>{ const body=m.parse(req.body); return { ok:true, nft_id:"nft-001" }; });

    f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
