import { useState } from "react";

type Summary = {
  ok: boolean;
  creator_id: string;
  mtd_gross_cents: number;
  applied_fee_bps: number;
  wallet_balance_cents: number;
};

type TipResult = {
  ok: boolean;
  result?: { ok: boolean; fee_cents: number };
  ref?: string;
  fraud?: { action: string; score: number };
  applied_fee_bps?: number;
  mtd_gross_before_cents?: number;
  error?: string;
};

const card: React.CSSProperties = {
  background: "#111723",
  border: "1px solid #1b2130",
  borderRadius: 12,
  padding: 20,
};

const wrap: React.CSSProperties = {
  maxWidth: 980,
  margin: "40px auto",
  display: "grid",
  gap: 24,
  gridTemplateColumns: "1fr 1fr",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #1b2130",
  background: "#0b0e14",
  color: "#e6e6e6",
};

const button: React.CSSProperties = {
  background: "#7c3aed",
  border: "none",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: 8,
  cursor: "pointer",
};

export default function Home() {
  // Tip state
  const [fromId, setFromId] = useState("viewer:heino");
  const [toId, setToId] = useState("creator:alpha");
  const [amount, setAmount] = useState(199);
  const [tipOut, setTipOut] = useState<string>("");

  // Summary state
  const [creatorId, setCreatorId] = useState("creator:alpha");
  const [summaryOut, setSummaryOut] = useState<string>("");

  const sendTip = async () => {
    try {
      setTipOut("Calling /tip…");
      const r = await fetch("http://localhost:7100/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_user_id: fromId,
          to_user_id: toId,
          amount_cents: Number(amount || 0),
        }),
      });
      const j: TipResult = await r.json();
      setTipOut(JSON.stringify(j, null, 2));
    } catch (e: any) {
      setTipOut("Error: " + e?.message || String(e));
    }
  };

  const loadSummary = async () => {
    try {
      setSummaryOut("Loading summary…");
      const r = await fetch(
        `http://localhost:7100/creator/${encodeURIComponent(creatorId)}/summary`
      );
      const j: Summary = await r.json();
      setSummaryOut(JSON.stringify(j, null, 2));
    } catch (e: any) {
      setSummaryOut("Error: " + e?.message || String(e));
    }
  };

  return (
    <div style={{ fontFamily: "system-ui", background: "#0b0e14", color: "#e6e6e6", minHeight: "100vh" }}>
      <div style={wrap}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Send a Tip</h2>
          <p style={{ opacity: 0.7, fontSize: 14 }}>
            Tips only with tiered platform fees (5/10/15%).
          </p>

          <label style={{ display: "block", margin: "10px 0 6px" }}>From (viewer_id)</label>
          <input style={input} value={fromId} onChange={(e) => setFromId(e.target.value)} />

          <label style={{ display: "block", margin: "10px 0 6px" }}>To (creator_id)</label>
          <input style={input} value={toId} onChange={(e) => setToId(e.target.value)} />

          <label style={{ display: "block", margin: "10px 0 6px" }}>Amount (cents)</label>
          <input
            style={input}
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value || 0))}
          />

          <p><button style={button} onClick={sendTip}>Send Tip</button></p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{tipOut}</pre>
        </div>

        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Creator Summary</h2>
          <p style={{ opacity: 0.7, fontSize: 14 }}>
            Shows MTD gross, current tier %, and wallet balance.
          </p>

          <label style={{ display: "block", margin: "10px 0 6px" }}>Creator ID</label>
          <input style={input} value={creatorId} onChange={(e) => setCreatorId(e.target.value)} />

          <p><button style={button} onClick={loadSummary}>Get Summary</button></p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{summaryOut}</pre>

          <p style={{ opacity: 0.7, fontSize: 14 }}>
            API: <code>GET http://localhost:7100/creator/&lbrace;id&rbrace;/summary</code>
          </p>
        </div>
      </div>
    </div>
  );
}
