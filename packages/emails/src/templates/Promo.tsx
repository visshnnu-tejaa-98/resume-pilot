/** @jsxRuntime automatic @jsxImportSource react */
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

export interface PromoEmailProps {
  firstName: string;
  segmentReason: string;
  credits: number;
  code: string;
  expiresOn: string;
  claimUrl: string;
  unsubscribeUrl?: string;
  dark?: boolean;
}

export function PromoEmail({
  firstName,
  segmentReason,
  credits,
  code,
  expiresOn,
  claimUrl,
  unsubscribeUrl,
  dark = false,
}: PromoEmailProps) {
  const t = emailTheme(dark);
  const creditsLabel = credits.toLocaleString("en-IN");

  return (
    <Html>
      <Head />
      <Preview>Use your code before {expiresOn}.</Preview>
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
            <EmailHeader dark={dark} tag="Just for you" />

            <Section
              style={{
                background: t.navy,
                color: "#F2F5F9",
                padding: "40px",
                textAlign: "center",
              }}
            >
              <Text style={{ margin: "0 0 14px", fontSize: "14px", color: "#C3CFDC" }}>
                {segmentReason}
              </Text>
              <Text
                style={{
                  margin: "0 0 14px",
                  fontFamily: FONT_DISPLAY,
                  fontSize: "34px",
                  fontWeight: 700,
                  lineHeight: "1.1",
                  color: "#F2F5F9",
                }}
              >
                {creditsLabel} free credits
              </Text>
              <table role="presentation" style={{ margin: "0 auto 14px" }}>
                <tr>
                  <td
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "30px",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      padding: "12px 22px",
                      borderRadius: "8px",
                      border: "2px dashed #FF9900",
                      color: "#FFB547",
                    }}
                  >
                    {code}
                  </td>
                </tr>
              </table>
              <Text style={{ margin: 0, fontSize: "13px", color: "#A9B8C9" }}>
                Valid until {expiresOn} · for your account only
              </Text>
            </Section>

            <Section style={{ padding: "32px 40px 40px" }}>
              <Text
                style={{ margin: "0 0 20px", fontSize: "15px", lineHeight: "1.7", color: t.text2 }}
              >
                Hi {firstName}, use these credits to tailor your resume for your next few
                applications and check each one&apos;s ATS score before you send it.
              </Text>
              <table role="presentation" width="100%" style={{ marginBottom: "20px" }}>
                <tr>
                  <td align="center">
                    <Button
                      href={claimUrl}
                      style={{
                        padding: "14px 28px",
                        borderRadius: "6px",
                        background: t.accent,
                        color: t.onAccent,
                        fontWeight: 700,
                        fontSize: "16px",
                      }}
                    >
                      Add {creditsLabel} credits
                    </Button>
                  </td>
                </tr>
              </table>
              <Section style={{ borderTop: `1px solid ${t.border}`, paddingTop: "16px" }}>
                <Text
                  style={{ margin: "0 0 6px", fontSize: "12px", lineHeight: "1.6", color: t.text2 }}
                >
                  • This code is personal and can be used once. It works even if you&apos;ve already
                  used EARLYBIRD or a referral code.
                </Text>
                <Text style={{ margin: 0, fontSize: "12px", lineHeight: "1.6", color: t.text2 }}>
                  • Credits never expire once added. The code itself expires on {expiresOn}.
                </Text>
              </Section>
            </Section>
          </Section>
          <EmailFooter dark={dark} marketing unsubscribeUrl={unsubscribeUrl} />
        </Container>
      </Body>
    </Html>
  );
}

PromoEmail.PreviewProps = {
  firstName: "Asha",
  segmentReason: "Thanks for tailoring 3 resumes with us",
  credits: 1000,
  code: "ASHA-K7Q2",
  expiresOn: "31 Mar 2027",
  claimUrl: "https://app.resumepilot.app/wallet",
  dark: false,
} satisfies PromoEmailProps;

export default PromoEmail;
