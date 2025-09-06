"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api";

export function TipForm({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [amount, setAmount] = useState(199);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function sendTip() {
    setBusy(true);
    setOut({ status: "Sending..." });
    try {
      const r = await fetch(`${apiUrl()}/tip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from_user_id: from, to_user_id: to, amount_cents: amount })
      });
      const j = await r.json();
      setOut(j);
    } catch (e: any) {
      setOut({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">From (viewer_id)</label>
      <input
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="w-full rounded-lg border border-stroke bg-base p-2"
      />

      <label className="block text-sm">To (creator_id)</label>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="w-full rounded-lg border border-stroke bg-base p-2"
      />

      <label className="block text-sm">Amount (cents)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
        className="w-full rounded-lg border border-stroke bg-base p-2"
      />

      <button
        onClick={sendTip}
        disabled={busy}
        className="rounded-xl bg-purple px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send Tip"}
      </button>

      <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">
        {out ? JSON.stringify(out, null, 2) : ""}
      </pre>
    </div>
  );
}
