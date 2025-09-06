// services/notifications/src/index.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import * as dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 7500);
const f = Fastify({ logger: true });
await f.register(cors, { origin: true });

// ---------- WS pub/sub: creator_id -> Set<WebSocket>
const channels = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ noServer: true });
f.server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname !== "/ws") { socket.destroy(); return; }
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      const creator = url.searchParams.get("creator_id") || "";
      if (!creator) { ws.close(1008, "creator_id required"); return; }
      const set = channels.get(creator) ?? new Set<WebSocket>();
      set.add(ws); channels.set(creator, set);
      ws.on("close", () => {
        const s = channels.get(creator);
        if (s) { s.delete(ws); if (s.size === 0) channels.delete(creator); }
      });
    });
  } catch { socket.destroy(); }
});

// ---------- Static: /console and any other files under /public
const publicDir = join(__dirname, "..", "public");
await f.register(fastifyStatic, { root: publicDir, prefix: "/" });
f.get("/console", async (_req, reply) => reply.type("text/html").sendFile("console.html"));

// Quiet favicon
f.get("/favicon.ico", async (_req, reply) => reply.code(204).send());

// Health
f.get("/health", async () => ({ ok: true }));

// ---------- Minimal overlay with “connected” dot + toast banners
f.get("/overlay", async (req, reply) => {
  const creator = (req.query as any).creator_id || "";
  const html = `<!doctype html><meta charset="utf-8"/>
<title>StreamHive Overlay</title>
<style>
html,body{height:100%}body{margin:0;background:transparent;font-family:system-ui}
#wrap{position:fixed;inset:0;pointer-events:none}
.banner{position:absolute;left:50%;top:20px;transform:translateX(-50%);
  background:rgba(0,0,0,.78);color:#fff;padding:12px 16px;border-radius:14px;font-size:18px}
#status{position:fixed;right:10px;bottom:10px;padding:6px 10px;border-radius:999px;background:#222;color:#fff;font-size:12px;opacity:.8}
#dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f33;margin-right:6px;vertical-align:middle}
#dot.ok{background:#2ecc71}
</style>
<div id="wrap"></div><div id="status"><span id="dot"></span>overlay</div>
<script>
(function(){
  var c=${JSON.stringify(creator)};
  var sch=(location.protocol==='https:')?'wss://':'ws://';
  var url=sch+location.host+'/ws?creator_id='+encodeURIComponent(c);
  var dot=document.getElementById('dot');
  var ws=new WebSocket(url);
  ws.onopen=function(){dot.classList.add('ok'); show({message:'✅ Overlay connected'});}
  ws.onclose=function(){dot.classList.remove('ok'); show({message:'⚠️ Overlay disconnected'});}
  ws.onmessage=function(e){try{show(JSON.parse(e.data));}catch(_){console.log(e.data);}}
  function show(m){
    var w=document.getElementById('wrap');
    var d=document.createElement('div'); d.className='banner';
    d.textContent=(m&&m.message)||'Event';
    w.appendChild(d); setTimeout(()=>d.remove(), 4000);
  }
})();
</script>`;
  return reply.type("text/html").send(html);
});

// ---------- POST /send -> broadcast to overlay(s)
f.post("/send", async (req, reply) => {
  const { kind, to, message, ref } = (req.body as any) ?? {};
  if (!to) return reply.code(400).send({ ok: false, error: "to required" });
  const set = channels.get(String(to));
  let delivered = 0;
  if (set?.size) {
    const payload = JSON.stringify({ kind, to, message, ref, ts: Date.now() });
    for (const ws of set) if (ws.readyState === ws.OPEN) { ws.send(payload); delivered++; }
  }
  return reply.send({ ok: true, delivered });
});

f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => { f.log.error(e); process.exit(1); });
