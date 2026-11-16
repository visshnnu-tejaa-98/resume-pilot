"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { fmtCredits, fmtInr } from "@/lib/format";
import { useWalletStore } from "@/stores/wallet-store";
import type { CreditPack } from "./types";

interface AddMoneyDialogProps {
  open: boolean;
  onClose: () => void;
  packs: CreditPack[];
  balance: number;
}

/**
 * Pick a top-up pack (design/screens/Wallet.dc.html "Add money"). Packs
 * come from `credit_packages` (prd.md §16.4: amounts are config, not code).
 * Razorpay checkout lands with payments (tasks/todo/m10-payments); until
 * then Pay is disabled and says so.
 */
export function AddMoneyDialog({ open, onClose, packs, balance }: AddMoneyDialogProps) {
  const live = useWalletStore((s) => s.balance) ?? balance;
  const [selected, setSelected] = useState<string | null>(packs[0]?.id ?? null);
  const pack = packs.find((p) => p.id === selected) ?? null;
  const total = pack ? pack.credits + pack.bonusCredits : 0;
  const paymentsEnabled = false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add money"
      footer={
        <>
          <Button variant="ghost" className="h-11 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11 px-5" disabled={!pack || !paymentsEnabled}>
            {pack ? `Pay ${fmtInr(pack.pricePaise / 100)}` : "Pay"}
          </Button>
        </>
      }
    >
      {packs.length === 0 ? (
        <p className="m-0 text-sm text-text-2">No top-up packs are available right now.</p>
      ) : (
        <div role="radiogroup" aria-label="Top-up pack" className="flex flex-col gap-2.5">
          {packs.map((p) => {
            const on = p.id === selected;
            return (
              <label
                key={p.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[10px] p-4",
                  on ? "border-2 border-link bg-sel-bg" : "border border-border hover:border-border-strong",
                )}
              >
                <input type="radio" name="pack" checked={on} onChange={() => setSelected(p.id)} className="size-[18px] accent-link" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <strong className="text-[17px]">{fmtInr(p.pricePaise / 100)}</strong>
                  <span className="font-mono text-sm font-semibold text-accent-text">
                    {fmtCredits(p.credits)} credits{p.bonusCredits ? ` + ${fmtCredits(p.bonusCredits)} bonus` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {pack ? (
        <div className="flex justify-between text-sm text-text-2">
          <span>Balance after payment</span>
          <span className="font-mono">
            {fmtCredits(live)} → {fmtCredits(live + total)}
          </span>
        </div>
      ) : null}
      {paymentsEnabled ? (
        <span className="text-[13px] text-text-2">You&apos;ll complete payment securely in Razorpay Checkout.</span>
      ) : (
        <Callout tone="info">Online payments are being set up. You&apos;ll be able to top up here soon.</Callout>
      )}
    </Dialog>
  );
}
