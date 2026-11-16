/** @jsxRuntime automatic @jsxImportSource react */
import { Section, Text } from "@react-email/components";
import { Actions, GAP, H1, P, PrimaryButton, SecondaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum, FONT_MONO } from "../components/theme";

export interface WelcomeEmailProps {
  firstName: string;
  /**
   * The launch coupon (EARLYBIRD), read from `coupons` at send time so
   * the code and amount are never hardcoded. `null` hides the gift
   * block, e.g. once the coupon is deactivated or expired.
   */
  launchCoupon: { code: string; credits: number } | null;
  /** Credits a new user gets for applying a friend's referral code (prd.md §2.1). */
  referralCredits: number;
  /** Where "Upload my resume" goes. */
  uploadUrl: string;
  /** Where codes are applied. */
  walletUrl: string;
  /** Footer links; defaults derive nothing app-specific, so senders should pass these. */
  links?: EmailLinks;
  dark?: boolean;
}

export function welcomeEmailSubject(firstName: string): string {
  return `Welcome to Resume Pilot, ${firstName}`;
}

const STEPS = [
  { h: "Upload your resume", p: "PDF, DOCX, LaTeX or a photo. Free." },
  { h: "Add a job description", p: "Paste the posting you want to apply for." },
  { h: "Generate and score", p: "Confirm the estimate, get a tailored resume and its ATS score." },
];

/** design/screens/EmailWelcome — transactional, sent once per account. */
export function WelcomeEmail({ firstName, launchCoupon, referralCredits, uploadUrl, walletUrl, links = PREVIEW_LINKS, dark = false }: WelcomeEmailProps) {
  const t = emailTheme(dark);
  const preview = launchCoupon ? `Claim ${fmtNum(launchCoupon.credits)} free credits and tailor your first resume.` : "Tailor your first resume in three steps.";

  return (
    <EmailLayout dark={dark} preview={preview} tag="Welcome aboard" marketing={false} links={links}>
      <H1 t={t} size={28}>
        You&apos;re in, {firstName}. Let&apos;s tailor your first resume.
      </H1>
      <P t={t}>
        Resume Pilot rewrites and reorders the experience you already have to fit each job, and never invents anything. Uploading your resume is free.
      </P>

      {launchCoupon ? (
        <Section style={{ border: `2px dashed ${t.accentLine}`, background: t.accentTint, borderRadius: "10px", padding: "20px", textAlign: "center", marginBottom: GAP }}>
          <Text style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 600, color: t.text2 }}>Your launch gift</Text>
          <Text style={{ margin: "0 0 6px", fontFamily: FONT_MONO, fontSize: "28px", fontWeight: 700, letterSpacing: "0.08em", color: t.text }}>{launchCoupon.code}</Text>
          <Text style={{ margin: "0 0 14px", fontSize: "14px", color: t.text }}>
            Apply it in your wallet for <strong>{fmtNum(launchCoupon.credits)} free credits</strong>.
          </Text>
          <Actions align="center" mb="0">
            <PrimaryButton t={t} href={walletUrl}>{`Claim ${fmtNum(launchCoupon.credits)} credits`}</PrimaryButton>
          </Actions>
          <Text style={{ margin: "14px 0 0", fontSize: "13px", color: t.text2 }}>
            {`Have a friend's referral code? Apply that instead for ${fmtNum(referralCredits)} credits. One code per account.`}
          </Text>
        </Section>
      ) : (
        <P t={t} size={14}>
          {"Have a friend's referral code? Apply it in your wallet for "}
          <strong>{`${fmtNum(referralCredits)} free credits`}</strong>.
        </P>
      )}

      <Text style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 600, color: t.text }}>Your first route</Text>
      {STEPS.map((s, i) => (
        <table key={s.h} role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "14px" }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", width: "28px" }}>
                <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "28px", height: "28px", borderRadius: "999px", background: i === 0 ? t.accent : t.navy }}>
                  <tbody>
                    <tr>
                      <td align="center" style={{ fontFamily: FONT_MONO, fontSize: "12px", fontWeight: 600, color: i === 0 ? t.onAccent : "#F2F5F9" }}>
                        {i + 1}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td style={{ verticalAlign: "top", paddingLeft: "14px" }}>
                <Text style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: t.text }}>{s.h}</Text>
                <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.55", color: t.text2 }}>{s.p}</Text>
              </td>
            </tr>
          </tbody>
        </table>
      ))}

      <Actions>
        <SecondaryButton t={t} href={uploadUrl}>
          Upload my resume
        </SecondaryButton>
      </Actions>

      <P t={t} size={13} mb="14px">
        Your wallet starts at 0 credits. Credits never expire, and you always see the cost before anything runs.
      </P>
      <P t={t} size={14} mb="0">
        — The Resume Pilot team
      </P>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  firstName: "Asha",
  launchCoupon: { code: "EARLYBIRD", credits: 500 },
  referralCredits: 100,
  uploadUrl: PREVIEW_LINKS.uploadUrl,
  walletUrl: PREVIEW_LINKS.walletUrl,
  links: PREVIEW_LINKS,
} satisfies WelcomeEmailProps;

export default WelcomeEmail;

