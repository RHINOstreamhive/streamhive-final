import Fastify from "fastify";
    import cors from "@fastify/cors";
    import * as dotenv from "dotenv";
    dotenv.config();
    const PORT = Number(process.env.PORT || 7600);
    const f = Fastify({ logger: true });
    await f.register(cors, { origin: true });
    f.get("/health", async () => ({ ok: true, service: "overlay-bridge" }));

import { z } from "zod";
const s = z.object({ platform:z.enum(["youtube","twitch","kick"]), creator_id:z.string(), payload:z.any() });
f.post("/post", async (req)=>{ const body=s.parse(req.body); return { ok:true, posted:true, platform: body.platform }; });

    f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
