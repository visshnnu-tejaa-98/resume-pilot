"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { useWalletStore } from "@/stores/wallet-store";

export type InitialClaim =
  | { status: "none" }
  | { status: "applied"; code: string | null; credits: number }
  | { status: "rejected"; message: string };

function CheckCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

/**
 * Welcome step 1: apply a coupon / referral code. If a code typed at
 * sign-up was already redeemed server-side, it starts in the applied
 * state. On success the wallet store is updated so the header balance
 * changes immediately.
 */
export function ClaimCreditsCard({ initial }: { initial: InitialClaim }) {
  const setBalance = useWalletStore((s) => s.setBalance);
  const [code, setCode] = useState("EARLYBIRD");
  const [applied, setApplied] = useState<{ code: string | null; credits: number } | null>(
    initial.status === "applied" ? { code: initial.code, credits: initial.credits } : null,
  );
  const [error, setError] = useState<string | null>(initial.status === "rejected" ? initial.message : null);
  const [busy, setBusy] = useState(false);

  async function apply(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await trpc.redeemCode.mutate({ code: trimmed });
      setBalance(res.balanceAfter);
      setApplied({ code: trimmed.toUpperCase(), credits: res.creditsToUser });
    } catch (err) {
      setError(trpcErrorMessage(err, "That code couldn't be applied."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card radius="lg" shadow className="flex flex-col gap-4 p-7 max-sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full font-mono text-[13px] font-semibold text-white",
              applied ? "bg-good" : "bg-hero",
            )}
          >
            1
          </span>
          <strong className="font-display text-xl">Claim your free credits</strong>
        </div>
        <span className="text-[13px] text-text-2">Optional</span>
      </div>
      <p className="m-0 text-[15px] leading-[1.6] text-text-2">
        Your wallet starts at 0 credits. Apply EARLYBIRD or a friend&apos;s referral code to add 500.
      </p>
      {applied ? (
        <Callout tone="good" role="status" icon={<CheckCircle />} className="items-center text-[15px]">
          <strong>{applied.code ? `${applied.code} applied.` : "Your code was applied."}</strong>{" "}
          {applied.credits.toLocaleString("en-IN")} credits added to your wallet.
        </Callout>
      ) : (
        <form onSubmit={apply} className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2.5">
            <label htmlFor="w-code" className="sr-only">
              Coupon or referral code
            </label>
            <input
              id="w-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              className="h-12 min-w-0 flex-[1_1_240px] rounded-md border border-dashed border-accent-line bg-accent-tint px-3.5 font-mono text-base font-semibold tracking-[0.06em] text-text outline-none focus-visible:ring-2 focus-visible:ring-link"
            />
            <Button type="submit" variant="outline" size="lg" disabled={busy || !code.trim()} className="h-12 font-bold">
              {busy ? "Applying…" : "Apply code"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="m-0 text-sm text-crit">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}
