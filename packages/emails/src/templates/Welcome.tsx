import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeader } from "../components/EmailHeader";
import { emailTheme, FONT_DISPLAY, FONT_MONO, FONT_SANS } from "../components/theme";

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
  dark?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-IN");

export function welcomeEmailSubject(firstName: string): string {
  return `Welcome to Resume Pilot, ${firstName}`;
}

const STEPS = [
  { h: "Upload your resume", p: "PDF, DOCX, LaTeX or a photo. Free." },
  { h: "Add a job description", p: "Paste the posting you want to apply for." },
  {
    h: "Generate and score",
    p: "Confirm the estimate, get a tailored resume and its ATS score.",
  },
];

export function WelcomeEmail({
  firstName,
  launchCoupon,
  referralCredits,
  uploadUrl,
  walletUrl,
  dark = false,
}: WelcomeEmailProps) {
  const t = emailTheme(dark);
  const preview = launchCoupon
    ? `Claim ${fmt(launchCoupon.credits)} free credits and tailor your first resume.`
    : "Tailor your first resume in three steps.";

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, background: t.outer, fontFamily: FONT_SANS }}>
        <Container style={{ width: "600px", padding: "24px 0" }}>
          <Section
            style={{
              width: "600px",
              background: t.card,
              border: `1px solid ${t.border}`,
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <EmailHeader dark={dark} tag="Welcome aboard" />
            <Section style={{ padding: "36px 40px 40px" }}>
              <Text
                style={{
                  margin: "0 0 22px",
                  fontFamily: FONT_DISPLAY,
                  fontSize: "28px",
                  lineHeight: "1.2",
                  color: t.text,
                  fontWeight: 700,
                }}
              >
                You&apos;re in, {firstName}. Let&apos;s tailor your first resume.
              </Text>
              <Text
                style={{ margin: "0 0 22px", fontSize: "15px", lineHeight: "1.7", color: t.text2 }}
              >
                Resume Pilot rewrites and reorders the experience you already have to fit each job,
                and never invents anything. Uploading your resume is free.
              </Text>

              {launchCoupon ? (
                <Section
                  style={{
                    border: `2px dashed ${t.accentLine}`,
                    background: t.accentTint,
                    borderRadius: "10px",
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: "22px",
                  }}
                >
                  <Text
                    style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 600, color: t.text2 }}
                  >
                    Your launch gift
                  </Text>
                  <Text
                    style={{
                      margin: "0 0 6px",
                      fontFamily: FONT_MONO,
                      fontSize: "28px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: t.text,
                    }}
                  >
                    {launchCoupon.code}
                  </Text>
                  <Text style={{ margin: "0 0 14px", fontSize: "14px", color: t.text }}>
                    Apply it in your wallet for{" "}
                    <strong>{fmt(launchCoupon.credits)} free credits</strong>.
                  </Text>
                  <Button
                    href={walletUrl}
                    style={{
                      padding: "14px 26px",
                      borderRadius: "6px",
                      background: t.accent,
                      color: t.onAccent,
                      fontWeight: 700,
                      fontSize: "15px",
                    }}
                  >
                    {`Claim ${fmt(launchCoupon.credits)} credits`}
                  </Button>
                  <Text style={{ margin: "14px 0 0", fontSize: "13px", color: t.text2 }}>
                    {`Have a friend's referral code? Apply that instead for ${fmt(referralCredits)} credits. One code per account.`}
                  </Text>
                </Section>
              ) : (
                <Text
                  style={{
                    margin: "0 0 22px",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: t.text2,
                  }}
                >
                  {"Have a friend's referral code? Apply it in your wallet for "}
                  <strong>{`${fmt(referralCredits)} free credits`}</strong>.
                </Text>
              )}

              <Text
                style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 600, color: t.text }}
              >
                Your first route
              </Text>
              {STEPS.map((s, i) => (
                <table key={s.h} role="presentation" width="100%" style={{ marginBottom: "14px" }}>
                  <tr>
                    <td style={{ verticalAlign: "top", width: "28px" }}>
                      <table
                        role="presentation"
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "999px",
                          background: i === 0 ? t.accent : t.navy,
                        }}
                      >
                        <tr>
                          <td
                            align="center"
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: "12px",
                              fontWeight: 600,
                              color: i === 0 ? t.onAccent : "#F2F5F9",
                            }}
                          >
                            {i + 1}
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td style={{ verticalAlign: "top", paddingLeft: "14px" }}>
                      <Text style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: t.text }}>
                        {s.h}
                      </Text>
                      <Text
                        style={{ margin: 0, fontSize: "14px", lineHeight: "1.55", color: t.text2 }}
                      >
                        {s.p}
                      </Text>
                    </td>
                  </tr>
                </table>
              ))}

              <Button
                href={uploadUrl}
                style={{
                  display: "inline-block",
                  padding: "13px 22px",
                  borderRadius: "6px",
                  border: `1px solid ${t.text}`,
                  color: t.text,
                  fontWeight: 600,
                  fontSize: "15px",
                  marginBottom: "22px",
                }}
              >
                Upload my resume
              </Button>

              <Text
                style={{ margin: "0 0 14px", fontSize: "13px", lineHeight: "1.6", color: t.text2 }}
              >
                Your wallet starts at 0 credits. Credits never expire, and you always see the cost
                before anything runs.
              </Text>
              <Text style={{ margin: 0, fontSize: "14px", color: t.text2 }}>
                — The Resume Pilot team
              </Text>
            </Section>
          </Section>
          <EmailFooter dark={dark} marketing={false} />
        </Container>
      </Body>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  firstName: "Asha",
  launchCoupon: { code: "EARLYBIRD", credits: 500 },
  referralCredits: 100,
  uploadUrl: "https://app.resumepilot.app/dashboard",
  walletUrl: "https://app.resumepilot.app/dashboard",
  dark: false,
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
