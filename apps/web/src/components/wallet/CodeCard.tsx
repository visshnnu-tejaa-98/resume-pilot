"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, TextLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { fmtCredits, fmtDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { useWalletStore } from "@/stores/wallet-store";
import type { Redemption } from "./types";

/** Wallet "Coupon or referral code" card: apply form, or the code already used. */
export function CodeCard({ redemption }: { redemption: Redemption | null }) {
  const router = useRouter();
  const setBalance = useWalletStore((s) => s.setBalance);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await trpc.redeemCode.mutate({ code: code.trim() });
      setBalance(res.balanceAfter);
      router.refresh();
    } catch (err) {
      setError(trpcErrorMessage(err, "That code couldn't be applied."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-[22px]">
      <strong className="font-display text-[17px]">Coupon or referral code</strong>
      {redemption ? (
        <div role="status" className="flex gap-2.5 rounded-lg bg-good-bg p-3 text-[13px] leading-normal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="flex-none text-good">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12l3 3 5-6" />
          </svg>
          <span>
            <strong>{redemption.code ?? "Your code"}</strong> applied on {fmtDate(redemption.createdAt)} (+{fmtCredits(redemption.creditsToUser)}{" "}
            credits). Each account can use one code.
          </span>
        </div>
      ) : (
        <form onSubmit={apply} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label htmlFor="wallet-code" className="sr-only">
              Code
            </label>
            <Input
              id="wallet-code"
              fieldSize="sm"
              placeholder="EARLYBIRD"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono font-semibold tracking-[0.06em]"
            />
            <Button type="submit" variant="outline" className="h-10 flex-none px-3.5 text-sm" disabled={busy || !code.trim()}>
              {busy ? "Applying…" : "Apply"}
            </Button>
          </div>
          {error ? (
            <span role="alert" className="text-[13px] text-crit">
              {error}
            </span>
          ) : (
            <span className="text-[13px] text-text-2">One code per account: a coupon or a friend&apos;s referral code.</span>
          )}
        </form>
      )}
      <TextLink href={routes.referrals} className="text-sm">
        Invite friends with your code
      </TextLink>
    </div>
  );
}
