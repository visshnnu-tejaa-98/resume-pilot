/** @jsxRuntime automatic @jsxImportSource react */
import { Actions, DetailTable, NavyStats, P, PrimaryButton, SecondaryButton, StatusHeading } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum } from "../components/theme";

export interface PaymentSuccessEmailProps {
  firstName: string;
  amountPaise: number;
  credits: number;
  newBalance: number;
  /** "UPI", "Card", "Netbanking" — from Razorpay. */
  method: string;
  paymentId: string;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  /** Pre-formatted in IST. */
  paidAt: string;
  /** GST line + refund window, from config (prd.md §16.4). */
  taxNote?: string;
  links: EmailLinks;
  dark?: boolean;
}

export const fmtRupees = (paise: number, decimals = 2) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const paymentSuccessEmailSubject = (p: Pick<PaymentSuccessEmailProps, "credits">) => `Payment received: ${fmtNum(p.credits)} credits added`;

/** design/screens/EmailPaySuccess — sent once per captured payment. */
export function PaymentSuccessEmail(p: PaymentSuccessEmailProps) {
  const { dark = false, links } = p;
  const t = emailTheme(dark);
  return (
    <EmailLayout
      dark={dark}
      preview={`${fmtRupees(p.amountPaise, 0)} paid via ${p.method}. Your new balance is ${fmtNum(p.newBalance)} credits.`}
      tag="Payment receipt"
      marketing={false}
      links={links}
    >
      <StatusHeading t={t} tone="good" title="Payment successful" sub={`Thanks, ${p.firstName}. Your wallet is topped up.`} />
      <NavyStats
        t={t}
        labelFirst
        stats={[
          { label: "Credits added", value: `+${fmtNum(p.credits)}`, color: "#FFB547" },
          { label: "New balance", value: fmtNum(p.newBalance), align: "right" },
        ]}
      />
      <DetailTable
        t={t}
        title="Receipt"
        rows={[
          { k: "Amount paid", v: fmtRupees(p.amountPaise), strong: true },
          { k: "Pack", v: `${fmtNum(p.credits)} credits` },
          { k: "Method", v: p.method },
          { k: "Payment ID", v: p.paymentId },
          ...(p.invoiceNumber ? [{ k: "Invoice no.", v: p.invoiceNumber }] : []),
          { k: "Date", v: p.paidAt },
        ]}
      />
      <Actions>
        <PrimaryButton t={t} href={links.generateUrl}>
          Tailor a resume
        </PrimaryButton>
        {p.invoiceUrl ? (
          <SecondaryButton t={t} href={p.invoiceUrl}>
            Download invoice
          </SecondaryButton>
        ) : null}
      </Actions>
      <P t={t} size={12} mb="0">
        {p.taxNote ?? "[GST DETAILS: GSTIN, tax breakup, invoice number]. Unused purchased credits can be refunded within [REFUND WINDOW]."}
      </P>
    </EmailLayout>
  );
}

PaymentSuccessEmail.PreviewProps = {
  firstName: "Asha",
  amountPaise: 50000,
  credits: 10000,
  newBalance: 19770,
  method: "UPI",
  paymentId: "pay_QZ19aB7xYt",
  invoiceNumber: "[INVOICE NO.]",
  invoiceUrl: "https://app.resumepilot.app/wallet",
  paidAt: "12 Nov 2026, 6:40 pm IST",
  links: PREVIEW_LINKS,
} satisfies PaymentSuccessEmailProps;

export default PaymentSuccessEmail;
