import { getMyPayment } from "@resume-pilot/services";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppMain } from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { fmtCredits, fmtInr } from "@/lib/format";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { getAppWallet, requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Payment" };

const ICONS = {
  ok: "M5 12l5 5 9-10",
  wait: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  fail: "M7 7l10 10M17 7 7 17",
};

/**
 * design/screens/PaymentResult.dc.html — where Razorpay checkout returns.
 * Status is read from our DB (set by the verified webhook), never from the
 * redirect's query string. Pending refreshes itself until it settles.
 */
export default async function PaymentResultPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { user } = await requireAppUser();
  const { orderId } = await params;
  const payment = await getMyPayment(getDb(), { userId: user.id, orderId });
  if (!payment) notFound();
  const wallet = await getAppWallet(user.id);

  const state = payment.status === "captured" ? "success" : payment.status === "created" ? "pending" : "failed";
  const s = {
    success: {
      title: `${fmtCredits(payment.credits)} credits added`,
      body: "Your payment went through and your wallet is topped up.",
      credits: `+${fmtCredits(payment.credits)}`,
      creditCls: "text-good",
      iconCls: "bg-good-bg text-good",
      icon: ICONS.ok,
      primary: { href: routes.generate, label: "Tailor a resume" },
      foot: "A receipt has been sent to your email.",
    },
    pending: {
      title: "Confirming your payment",
      body: "Razorpay is still confirming this payment. Credits are added automatically, exactly once, as soon as it clears.",
      credits: "Pending",
      creditCls: "text-info",
      iconCls: "bg-info-bg text-info",
      icon: ICONS.wait,
      primary: { href: routes.dashboard, label: "Go to dashboard" },
      foot: "Usually under a minute. You can leave this page.",
    },
    failed: {
      title: payment.status === "refunded" ? "Payment refunded" : "Payment didn’t go through",
      body:
        payment.status === "refunded"
          ? "This payment was refunded to your original payment method."
          : "No money was taken and no credits were added. Try again or use a different method.",
      credits: "0",
      creditCls: "text-text-2",
      iconCls: "bg-crit-bg text-crit",
      icon: ICONS.fail,
      primary: { href: routes.wallet, label: "Try again" },
      foot: "If money left your account, contact support with the payment ID.",
    },
  }[state];

  return (
    <AppMain className="items-center py-16">
      {state === "pending" ? <meta httpEquiv="refresh" content="5" /> : null}
      <div className="flex w-full max-w-[520px] flex-col items-center gap-[18px] rounded-2xl border border-border bg-surface p-9 text-center shadow-card-sm max-sm:p-6">
        <span className={cn("flex size-16 items-center justify-center rounded-full", s.iconCls)}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={s.icon} />
          </svg>
        </span>
        <div className="flex flex-col gap-2" role="status">
          <h1 className="m-0 font-display text-[28px] font-bold">{s.title}</h1>
          <p className="m-0 text-[15px] leading-[1.6] text-text-2">{s.body}</p>
        </div>
        <dl className="m-0 flex w-full flex-col gap-2.5 border-y border-border py-4 text-left text-sm">
          {[
            ["Amount", <strong key="a">{fmtInr(payment.amountPaise / 100)}</strong>],
            ["Credits", <strong key="c" className={cn("font-mono", s.creditCls)}>{s.credits}</strong>],
            ["New balance", <strong key="b" className="font-mono">{fmtCredits(wallet.balance)}</strong>],
            ["Payment ID", <span key="p" className="font-mono">{payment.paymentId ?? payment.orderId}</span>],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-3">
              <dt className="text-text-2">{k}</dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-center gap-2.5">
          <ButtonLink href={s.primary.href} className="h-[46px]">
            {s.primary.label}
          </ButtonLink>
          <ButtonLink href={routes.wallet} variant="outline" className="h-[46px]">
            Back to wallet
          </ButtonLink>
        </div>
        <span className="text-[13px] text-text-2">{s.foot}</span>
      </div>
    </AppMain>
  );
}
