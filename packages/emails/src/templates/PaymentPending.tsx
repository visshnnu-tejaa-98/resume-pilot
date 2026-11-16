/** @jsxRuntime automatic @jsxImportSource react */
import { Section } from "@react-email/components";
import { Actions, DetailTable, GAP, H1, Notice, P, SecondaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { type EmailTheme, emailTheme, fmtNum, FONT_MONO } from "../components/theme";
import { fmtRupees } from "./PaymentSuccess";

export interface PaymentPendingEmailProps {
  amountPaise: number;
  credits: number;
  method: string;
  paymentId: string;
  /** Payment result page for this order. */
  statusUrl: string;
  /** e.g. "24 hours" — when Razorpay auto-cancels; from config. */
  timeLimit?: string;
  links: EmailLinks;
  dark?: boolean;
}

export const paymentPendingEmailSubject = (p: Pick<PaymentPendingEmailProps, "amountPaise">) => `We're confirming your ${fmtRupees(p.amountPaise, 0)} payment`;

/** Three-stop progress: paid (done) → bank confirming (now) → credits added. */
function Route({ t }: { t: EmailTheme }) {
  const stops = [
    { label: "You paid", bg: t.link, fg: "#FFFFFF", ring: t.link, weight: 500, color: t.text },
    { label: "Bank confirming", bg: t.accent, fg: t.onAccent, ring: t.accent, weight: 600, color: t.text },
    { label: "Credits added", bg: t.card, fg: t.text2, ring: t.borderStrong, weight: 500, color: t.text2 },
  ];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: GAP }}>
      <tbody>
        <tr>
          {stops.map((s, i) => (
            <td key={s.label} style={{ width: "33%", verticalAlign: "top" }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={{ width: "28px" }}>
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          lineHeight: "24px",
                          borderRadius: "999px",
                          background: s.bg,
                          border: `2px solid ${s.ring}`,
                          color: s.fg,
                          textAlign: "center",
                          fontFamily: FONT_MONO,
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        {i + 1}
                      </div>
                    </td>
                    <td style={{ padding: "0 6px" }}>
                      {i < 2 ? <div style={{ borderTop: `2px ${i === 0 ? "solid" : "dashed"} ${i === 0 ? t.link : t.borderStrong}` }} /> : null}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ paddingTop: "8px", fontSize: "13px", fontWeight: s.weight, color: s.color }}>{s.label}</div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** design/screens/EmailPayPending — still pending after N minutes. */
export function PaymentPendingEmail(p: PaymentPendingEmailProps) {
  const { dark = false, links } = p;
  const t = emailTheme(dark);
  return (
    <EmailLayout
      dark={dark}
      preview="Please don't pay again. Credits are added automatically once it clears."
      tag="Payment update"
      marketing={false}
      links={links}
    >
      <Section>
        <H1 t={t} mb="6px">
          Your payment is being confirmed
        </H1>
        <P t={t}>Your bank or UPI app is taking a little longer than usual. This normally sorts itself out.</P>
      </Section>
      <Route t={t} />
      <Notice t={t} tone="warn">
        <strong>Please don&apos;t pay again.</strong> As soon as this payment clears we&apos;ll add {fmtNum(p.credits)} credits, exactly once, and email you.
      </Notice>
      <DetailTable
        t={t}
        rows={[
          { k: "Amount", v: fmtRupees(p.amountPaise) },
          { k: "Method", v: p.method },
          { k: "Payment ID", v: p.paymentId },
        ]}
      />
      <P t={t} size={14}>
        If it isn&apos;t confirmed within {p.timeLimit ?? "[TIME LIMIT]"}, the payment is cancelled and any money taken is returned to you automatically.
      </P>
      <Actions mb="0">
        <SecondaryButton t={t} href={p.statusUrl}>
          Check payment status
        </SecondaryButton>
      </Actions>
    </EmailLayout>
  );
}

PaymentPendingEmail.PreviewProps = {
  amountPaise: 50000,
  credits: 10000,
  method: "UPI",
  paymentId: "pay_PU55cTr4",
  statusUrl: "https://app.resumepilot.app/wallet/payments/order_PU55cT",
  links: PREVIEW_LINKS,
} satisfies PaymentPendingEmailProps;

export default PaymentPendingEmail;
