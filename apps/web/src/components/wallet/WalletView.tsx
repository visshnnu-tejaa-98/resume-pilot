"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { RouteCurve } from "@/components/site/RouteDecor";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { aiActionLabel, ledgerLabel } from "@/lib/domain";
import { fmtCredits, fmtInr, fmtRelative, fmtSignedCredits } from "@/lib/format";
import { useWalletStore } from "@/stores/wallet-store";
import { AddMoneyDialog } from "./AddMoneyDialog";
import { CodeCard } from "./CodeCard";
import { LedgerHistory } from "./LedgerHistory";
import type { CreditPack, LedgerRow, Redemption } from "./types";

type Tab = "overview" | "history";

interface WalletViewProps {
  balance: number;
  held: number;
  available: number;
  holds: { aiJobId: string; action: string; credits: number }[];
  history: LedgerRow[];
  nextCursor: string | null;
  packs: CreditPack[];
  redemption: Redemption | null;
}

/** design/screens/Wallet.dc.html — tab is mirrored in ?tab= so it's linkable. */
export function WalletView(props: WalletViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "history" ? "history" : "overview";
  const [payOpen, setPayOpen] = useState(false);
  const available = useWalletStore((s) => s.balance) ?? props.balance;
  const spendable = available - props.held;
  const firstPack = props.packs[0];

  const setTab = (t: Tab) => router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Wallet"
        subtitle="Credits never expire. You only pay for AI actions that succeed."
        actions={
          <Button className="h-[42px] px-[18px] text-sm" onClick={() => setPayOpen(true)}>
            Add money
          </Button>
        }
      />
      <Tabs<Tab>
        label="Wallet"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "history", label: "History" },
        ]}
      />

      {tab === "overview" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
            <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-[14px] bg-hero p-[26px] text-on-hero md:col-span-2">
              <RouteCurve width={320} height={120} d="M0 110 C 100 110, 150 30, 230 34 S 310 14, 320 8" dash="7 9" className="-right-2.5 -bottom-2.5 opacity-50" />
              <span className="relative text-sm text-on-hero-3">Available balance</span>
              <span className="relative font-mono text-5xl font-semibold max-sm:text-4xl">
                {fmtCredits(spendable)} <span className="text-lg text-on-hero-3">credits</span>
              </span>
              <div className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-hero-2">
                <span>
                  Total: <strong className="font-mono text-on-hero">{fmtCredits(available)}</strong>
                </span>
                <span>
                  On hold: <strong className="font-mono text-on-hero">{fmtCredits(props.held)}</strong>
                </span>
              </div>
              {props.holds.length ? (
                <ul className="relative m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-on-hero-3">
                  {props.holds.map((h) => (
                    <li key={h.aiJobId}>
                      {aiActionLabel(h.action)} in progress · up to <span className="font-mono">{fmtCredits(h.credits)}</span> held
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <CodeCard redemption={props.redemption} />
          </div>

          {firstPack ? (
            <section className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-border bg-surface p-[22px]">
              <div className="flex flex-col gap-1.5">
                <strong className="font-display text-[19px]">Top-up pack</strong>
                <span className="text-[15px]">
                  <span className="font-display text-[22px] font-bold">{fmtInr(firstPack.pricePaise / 100)}</span> <span className="text-text-2">→</span>{" "}
                  <span className="font-mono text-lg font-semibold text-accent-text">{fmtCredits(firstPack.credits + firstPack.bonusCredits)} credits</span>
                </span>
                <span className="text-[13px] text-text-2">UPI, cards and netbanking via Razorpay · [GST NOTE]</span>
              </div>
              <Button className="h-[46px] px-[22px]" onClick={() => setPayOpen(true)}>
                Add {fmtInr(firstPack.pricePaise / 100)}
              </Button>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[14px] border border-border bg-surface">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="m-0 font-display text-lg font-bold">Recent activity</h2>
              <button type="button" onClick={() => setTab("history")} className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-link">
                Full history
              </button>
            </div>
            {props.history.length === 0 ? (
              <p className="m-0 border-t border-border px-5 py-4 text-sm text-text-2">No activity yet.</p>
            ) : (
              props.history.slice(0, 4).map((r) => (
                <div key={r.id} className="flex justify-between gap-3 border-t border-border px-5 py-[13px] text-sm">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">{ledgerLabel(r)}</span>
                    <span className="text-xs text-text-2">{fmtRelative(r.createdAt)}</span>
                  </div>
                  <span className={cn("font-mono font-semibold", r.credits > 0 ? "text-good" : "text-text")}>{fmtSignedCredits(r.credits)}</span>
                </div>
              ))
            )}
          </section>
        </div>
      ) : (
        <LedgerHistory initial={props.history} initialCursor={props.nextCursor} />
      )}

      <AddMoneyDialog open={payOpen} onClose={() => setPayOpen(false)} packs={props.packs} balance={available} />
    </>
  );
}
