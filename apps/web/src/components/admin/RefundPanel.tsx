"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { fmtPaise } from "@/lib/admin-format";
import { fmtCredits, fmtDate } from "@/lib/format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";
import { StatusPill } from "./ui";

export interface RefundQuoteView {
  paymentRowId: string;
  refundableCredits: number;
  refundablePaise: number;
  packCredits: number;
  amountPaise: number;
  deadline: Date;
  blockedReason: string | null;
}

export interface RefundView {
  id: string;
  credits: number;
  amountPaise: number;
  status: "pending" | "processing" | "processed" | "failed";
  razorpayRefundId: string | null;
  reason: string;
  error: string | null;
  createdAt: Date;
}

/** Mirrors services `proRataRefundPaise` for the live preview; the server recomputes and is authoritative. */
const proRata = (credits: number, q: RefundQuoteView) => Math.floor((Math.min(credits, q.packCredits) * q.amountPaise) / q.packCredits);

/**
 * prd.md §11.2: refund unused purchased credits within 6 months, pro rata.
 * The server re-checks everything inside a locked transaction; this only
 * shows the quote. Credits are debited before Razorpay is called.
 */
export function RefundPanel({ quote, refund }: { quote: RefundQuoteView | null; refund: RefundView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState(String(quote?.refundableCredits ?? ""));
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (refund) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <strong>Refund</strong>
          <StatusPill status={refund.status === "processed" ? "succeeded" : refund.status === "failed" ? "failed" : "pending"} label={refund.status} />
        </div>
        <span>
          {fmtCredits(refund.credits)} credits debited · {fmtPaise(refund.amountPaise, 2)} to the customer
        </span>
        {refund.razorpayRefundId ? <span className="font-mono break-all">{refund.razorpayRefundId}</span> : null}
        <span className="text-text-2">Reason: {refund.reason}</span>
        {refund.error ? <span className="text-crit">Razorpay: {refund.error}</span> : null}
        {refund.status === "pending" || refund.status === "failed" ? (
          <Button
            className="h-9 self-start px-3 text-sm"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              setMsg(null);
              try {
                const r = await trpc.admin.payments.retryRefund.mutate({ refundId: refund.id });
                setMsg(r.status === "pending" ? "Razorpay still didn't accept it. Try again shortly." : "Sent to Razorpay.");
                router.refresh();
              } catch (err) {
                setMsg(trpcErrorMessage(err));
              } finally {
                setRetrying(false);
              }
            }}
          >
            Retry with Razorpay
          </Button>
        ) : null}
        {msg ? <span role="status">{msg}</span> : null}
      </div>
    );
  }

  if (!quote) return null;
  if (quote.blockedReason) {
    return <p className="m-0 rounded-lg bg-surface-2 p-3 text-xs leading-normal text-text-2">Not refundable: {quote.blockedReason}.</p>;
  }

  const n = Math.floor(Number(credits));
  const ok = Number.isFinite(n) && n > 0 && n <= quote.refundableCredits;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-[13px]">
      <span>
        <strong className="font-mono">{fmtCredits(quote.refundableCredits)}</strong> of {fmtCredits(quote.packCredits)} credits unused →{" "}
        <strong>{fmtPaise(quote.refundablePaise, 2)}</strong>
      </span>
      <span className="text-text-2">Refundable until {fmtDate(quote.deadline)}. Coupon and referral credits are never refunded.</span>
      <Button variant="outline" className="h-9 self-start px-3 text-sm" onClick={() => setOpen(true)}>
        Refund…
      </Button>
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Refund unused credits"
        subtitle="Credits are removed from the wallet first, then Razorpay sends the money back to the original payment method."
        confirmLabel={ok ? `Refund ${fmtPaise(proRata(n, quote), 2)}` : "Refund"}
        danger
        onConfirm={async (reason) => {
          if (!ok) throw new Error(`Enter 1 to ${fmtCredits(quote.refundableCredits)} credits.`);
          try {
            await trpc.admin.payments.refund.mutate({ paymentRowId: quote.paymentRowId, credits: n, reason });
            router.refresh();
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      >
        <Field label="Credits to refund" help={ok ? `${fmtCredits(n)} × ${fmtPaise(quote.amountPaise, 2)} ÷ ${fmtCredits(quote.packCredits)} = ${fmtPaise(proRata(n, quote), 2)} (rounded down)` : undefined}>
          <Input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </Field>
      </ReasonDialog>
    </div>
  );
}
