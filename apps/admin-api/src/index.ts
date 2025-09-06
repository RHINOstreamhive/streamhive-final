import Fastify from "fastify";
import cors from "@fastify/cors";
import * as dotenv from "dotenv";
dotenv.config();
const PORT = Number(process.env.PORT || 7900);
const f = Fastify({ logger: true });
await f.register(cors, { origin: true });
f.get("/health", async () => ({ ok: true, service: "admin-api" }));

f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
