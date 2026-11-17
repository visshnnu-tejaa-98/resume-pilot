"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { appRoutes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { fmtCredits, fmtInr } from "@/lib/format";
import { useWalletStore } from "@/stores/wallet-store";
import type { CreditPack } from "./types";

interface AddMoneyDialogProps {
  open: boolean;
  onClose: () => void;
  packs: CreditPack[];
  balance: number;
  paymentsEnabled: boolean;
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScript: Promise<void> | undefined;
/** Razorpay Checkout must be loaded from Razorpay's own URL (it can't be bundled). */
function loadCheckout(): Promise<void> {
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const el = Object.assign(document.createElement("script"), { src: CHECKOUT_SRC, async: true });
    el.onload = () => resolve();
    el.onerror = () => {
      checkoutScript = undefined;
      reject(new Error("Couldn't load Razorpay Checkout. Check your connection and try again."));
    };
    document.body.appendChild(el);
  });
  return checkoutScript;
}

/**
 * Pick a top-up pack (design/screens/Wallet.dc.html "Add money"). Packs
 * come from `credit_packages` (prd.md §16.4: amounts are config, not code).
 * Pay creates a server-side order, opens Razorpay Checkout, sends the
 * signed result to `payments.confirm`, then shows the result page, which
 * reads the status from our DB (the webhook may settle it instead).
 */
export function AddMoneyDialog({ open, onClose, packs, balance, paymentsEnabled }: AddMoneyDialogProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useWalletStore((s) => s.balance) ?? balance;
  const [selected, setSelected] = useState<string | null>(packs[0]?.id ?? null);
  const pack = packs.find((p) => p.id === selected) ?? null;
  const total = pack ? pack.credits + pack.bonusCredits : 0;

  async function pay() {
    if (!pack) return;
    setBusy(true);
    setError(null);
    try {
      const [order] = await Promise.all([trpc.payments.createOrder.mutate({ packageId: pack.id }), loadCheckout()]);
      if (!window.Razorpay) throw new Error("Razorpay Checkout didn't load.");
      const result = appRoutes.paymentResult(order.orderId);
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Resume Pilot",
        description: `${fmtCredits(order.credits)} credits`,
        theme: { color: "#1f3a5f" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: RazorpaySuccess) => {
          // Even if this call fails, the webhook grants; the result page waits for whichever lands.
          await trpc.payments.confirm
            .mutate({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature })
            .catch(() => undefined);
          router.push(result);
        },
      });
      checkout.on("payment.failed", (r) => setError(r.error?.description ?? "The payment didn't go through. No money was taken."));
      checkout.open();
    } catch (err) {
      setError(trpcErrorMessage(err, err instanceof Error ? err.message : undefined));
      setBusy(false);
    }
  }

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
          <Button className="h-11 px-5" disabled={!pack || !paymentsEnabled || busy} aria-busy={busy} onClick={() => void pay()}>
            {busy ? "Opening checkout…" : pack ? `Pay ${fmtInr(pack.pricePaise / 100)}` : "Pay"}
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
      {error ? <Callout tone="crit">{error}</Callout> : null}
      {paymentsEnabled ? (
        <span className="text-[13px] text-text-2">You&apos;ll complete payment securely in Razorpay Checkout.</span>
      ) : (
        <Callout tone="info">Online payments are being set up. You&apos;ll be able to top up here soon.</Callout>
      )}
    </Dialog>
  );
}
