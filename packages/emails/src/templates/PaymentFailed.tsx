/** @jsxRuntime automatic @jsxImportSource react */
import { Actions, Bullets, DetailTable, Notice, PrimaryButton, StatusHeading } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme } from "../components/theme";
import { fmtRupees } from "./PaymentSuccess";

export interface PaymentFailedEmailProps {
  amountPaise: number;
  method: string;
  /** Razorpay's error description, if any. */
  reason?: string | null;
  paymentId: string;
  /** e.g. "5–7 working days" — from config. */
  bankRefundWindow?: string;
  links: EmailLinks;
  dark?: boolean;
}

export const paymentFailedEmailSubject = (p: Pick<PaymentFailedEmailProps, "amountPaise">) =>
  `Your ${fmtRupees(p.amountPaise, 0)} payment didn't go through`;

/** design/screens/EmailPayFailed — Razorpay payment.failed. */
export function PaymentFailedEmail(p: PaymentFailedEmailProps) {
  const { dark = false, links } = p;
  const t = emailTheme(dark);
  return (
    <EmailLayout dark={dark} preview="No credits were added. You can try again in a minute." tag="Payment update" marketing={false} links={links}>
      <StatusHeading t={t} tone="crit" title="Payment didn't go through" sub="Your wallet hasn't changed." />
      <Notice t={t} tone="info">
        If money left your account, it&apos;s usually returned by your bank within {p.bankRefundWindow ?? "[5–7] working days"}. You don&apos;t need to
        do anything.
      </Notice>
      <DetailTable
        t={t}
        rows={[
          { k: "Amount", v: fmtRupees(p.amountPaise) },
          { k: "Method", v: p.method },
          ...(p.reason ? [{ k: "Reason", v: p.reason }] : []),
          { k: "Payment ID", v: p.paymentId },
        ]}
      />
      <Bullets
        t={t}
        title="Things that usually help"
        items={["Try UPI or a different card", "Check that your bank allows online payments", "Wait a minute before retrying so the bank can reset"]}
      />
      <Actions mb="0">
        <PrimaryButton t={t} href={links.walletUrl}>
          Try again
        </PrimaryButton>
      </Actions>
    </EmailLayout>
  );
}

PaymentFailedEmail.PreviewProps = {
  amountPaise: 50000,
  method: "Netbanking",
  reason: "[REASON FROM RAZORPAY]",
  paymentId: "pay_PV02mNx9",
  links: PREVIEW_LINKS,
} satisfies PaymentFailedEmailProps;

export default PaymentFailedEmail;
