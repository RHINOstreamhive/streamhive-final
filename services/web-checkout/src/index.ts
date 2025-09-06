import Fastify from "fastify";
import cors from "@fastify/cors";

const PORT = Number(process.env.PORT || 7600);
const f = Fastify({ logger: true });

await f.register(cors, { origin: true });

f.get("/health", async () => ({ ok: true }));

f.get("/", async (_req, reply) => {
  const html = `
  <!doctype html><html><head><meta charset="utf-8"/>
    <title>StreamHive • Tip & Summary</title>
    <style>
      body{font-family:system-ui;background:#0b0e14;color:#e6e6e6;margin:0;padding:40px}
      .wrap{max-width:980px;margin:auto;display:grid;gap:24px;grid-template-columns:1fr 1fr}
      .card{background:#111723;border:1px solid #1b2130;border-radius:12px;padding:20px}
      button{background:#7c3aed;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer}
      input{width:100%;padding:10px;border-radius:8px;border:1px solid #1b2130;background:#0b0e14;color:#e6e6e6}
      label{display:block;margin:10px 0 6px}
      .muted{opacity:.7;font-size:14px}
      pre{white-space:pre-wrap}
      h2{margin-top:0}
      code{background:#0b0e14;padding:2px 6px;border-radius:6px}
    </style>
  </head><body>
    <div class="wrap">
      <div class="card">
        <h2>Send a Tip</h2>
        <p class="muted">Tips only with tiered platform fees (5/10/15%).</p>
        <label>From (viewer_id)</label>
        <input id="from" value="viewer:heino"/>
        <label>To (creator_id)</label>
        <input id="to" value="creator:alpha"/>
        <label>Amount (cents)</label>
        <input id="amount" type="number" value="199"/>
        <p><button id="tip">Send Tip</button></p>
        <pre id="out"></pre>
      </div>

      <div class="card">
        <h2>Creator Summary</h2>
        <p class="muted">Shows MTD gross, current tier %, and wallet balance.</p>
        <label>Creator ID</label>
        <input id="creator" value="creator:alpha"/>
        <p><button id="summary">Get Summary</button></p>
        <pre id="sumout"></pre>
        <p class="muted">API: <code>GET http://localhost:7100/creator/{id}/summary</code></p>
      </div>
    </div>

    <script>
      const $ = (id)=>document.getElementById(id);

      $("tip").onclick = async () => {
        const body = {
          from_user_id: $("from").value,
          to_user_id: $("to").value,
          amount_cents: Number($("amount").value||0)
        };
        $("out").textContent = "Calling /tip...";
        try {
          const r = await fetch("http://localhost:7100/tip", {
            method:"POST", headers:{ "Content-Type":"application/json" },
            body: JSON.stringify(body)
          });
          const j = await r.json();
          $("out").textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          $("out").textContent = "Error: " + e;
        }
      };

      $("summary").onclick = async () => {
        const id = encodeURIComponent($("creator").value);
        $("sumout").textContent = "Loading summary...";
        try {
          const r = await fetch(\`http://localhost:7100/creator/\${id}/summary\`);
          const j = await r.json();
          $("sumout").textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          $("sumout").textContent = "Error: " + e;
        }
      };
    </script>
  </body></html>`;
  return reply.type("text/html").send(html);
});

f.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => {
  f.log.error(e);
  process.exit(1);
});