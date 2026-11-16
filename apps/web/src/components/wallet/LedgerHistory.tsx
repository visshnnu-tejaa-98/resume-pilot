"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { ledgerLabel } from "@/lib/domain";
import { fmtCredits, fmtDate, fmtSignedCredits, fmtTime } from "@/lib/format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import type { LedgerRow } from "./types";

type TypeFilter = "all" | "topups" | "ai" | "codes" | "refunds";
type Period = "30d" | "all";

const TYPE_MATCH: Record<TypeFilter, (t: string) => boolean> = {
  all: () => true,
  topups: (t) => t === "purchase",
  ai: (t) => t === "capture",
  codes: (t) => t === "coupon_credit" || t === "referral_credit",
  refunds: (t) => t === "refund",
};

const th = "px-3 py-3 text-xs uppercase tracking-[0.06em] text-text-2";

function toCsv(rows: LedgerRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [new Date(r.createdAt).toISOString(), esc(ledgerLabel(r)), r.type, r.credits, r.balanceAfter].join(","),
  );
  return ["date,activity,type,credits,balance_after", ...lines].join("\n");
}

/** Wallet History tab: filters, table, load-more, CSV of loaded rows. */
export function LedgerHistory({ initial, initialCursor }: { initial: LedgerRow[]; initialCursor: string | null }) {
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [type, setType] = useState<TypeFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const since = period === "30d" ? Date.now() - 30 * 86_400_000 : 0;
    return rows.filter((r) => TYPE_MATCH[type](r.type) && +new Date(r.createdAt) >= since);
  }, [rows, type, period]);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await trpc.walletHistory.query({ limit: 50, cursor });
      setRows((r) => [...r, ...page.history]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(trpcErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(visible)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "resume-pilot-credits.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-2 text-sm text-text-2">
          Type
          <Select fieldSize="sm" value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="h-[38px] w-auto bg-surface font-medium">
            <option value="all">All activity</option>
            <option value="topups">Top-ups</option>
            <option value="ai">AI actions</option>
            <option value="codes">Codes</option>
            <option value="refunds">Refunds</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-2">
          Period
          <Select fieldSize="sm" value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-[38px] w-auto bg-surface font-medium">
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </Select>
        </label>
        <Button variant="outline" className="ml-auto h-[38px] border-border-strong bg-surface px-3.5 text-sm" onClick={exportCsv} disabled={visible.length === 0}>
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th scope="col" className={`${th} pl-[18px]`}>Date</th>
              <th scope="col" className={th}>Activity</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={`${th} text-right`}>Credits</th>
              <th scope="col" className={`${th} pr-[18px] text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-[18px] py-6 text-center text-text-2">
                  No activity for these filters.
                </td>
              </tr>
            ) : (
              visible.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-3.5 pr-3 pl-[18px] whitespace-nowrap text-text-2">
                    {fmtDate(l.createdAt)}, {fmtTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-3.5">{ledgerLabel(l)}</td>
                  <td className="px-3 py-3.5">
                    <Chip tone="good" pill className="px-[9px] py-[3px] text-xs font-semibold">
                      Completed
                    </Chip>
                  </td>
                  <td className={cn("px-3 py-3.5 text-right font-mono font-semibold", l.credits > 0 ? "text-good" : l.credits === 0 ? "text-text-2" : "text-text")}>
                    {fmtSignedCredits(l.credits)}
                  </td>
                  <td className="py-3.5 pr-[18px] pl-3 text-right font-mono text-text-2">{fmtCredits(l.balanceAfter)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error ? <p role="alert" className="m-0 text-sm text-crit">{error}</p> : null}
      {cursor ? (
        <Button variant="outline" className="h-10 self-center border-border-strong px-4 text-sm" onClick={more} disabled={loading}>
          {loading ? "Loading…" : "Load older activity"}
        </Button>
      ) : null}
    </div>
  );
}
