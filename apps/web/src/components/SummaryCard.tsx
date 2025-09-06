"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

type Summary = {
  ok: boolean;
  creator_id: string;
  mtd_gross_cents: number;
  applied_fee_bps: number;
  wallet_balance_cents: number;
};

export function SummaryCard({ creatorId }: { creatorId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`${apiUrl()}/creator/${encodeURIComponent(creatorId)}/summary`);
      const j = (await r.json()) as Summary;
      setData(j);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [creatorId]);

  const dollars = (cents: number) => (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stroke bg-base p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Creator</span>
          <span className="text-zinc-200">{creatorId}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="MTD Gross" value={`$${data ? dollars(data.mtd_gross_cents) : "—"}`} badge="transparent" />
          <Metric label="Current Tier" value={data ? `${(data.applied_fee_bps / 100).toFixed(0)}%` : "—"} />
          <Metric label="Wallet Net" value={`$${data ? dollars(data.wallet_balance_cents) : "—"}`} badge="green" />
        </div>

        <div className="mt-4">
          <button
            onClick={load}
            disabled={busy}
            className="rounded-xl border border-stroke bg-card px-3 py-2 text-sm hover:border-purple disabled:opacity-50"
          >
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string; badge?: "green" | "transparent" }) {
  return (
    <div className="rounded-lg border border-stroke bg-card p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-lg">{value}</div>
    </div>
  );
}
