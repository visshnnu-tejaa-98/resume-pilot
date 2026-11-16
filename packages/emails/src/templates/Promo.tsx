/** @jsxRuntime automatic @jsxImportSource react */
import { Section, Text } from "@react-email/components";
import { Actions, P, PrimaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum, FONT_DISPLAY, FONT_MONO } from "../components/theme";

/**
 * design/screens/EmailPromo — personal single-use gift code. Postponed
 * in the PRD (gift codes aren't built); kept so campaigns can use it later.
 */
export interface PromoEmailProps {
  firstName: string;
  segmentReason: string;
  credits: number;
  code: string;
  expiresOn: string;
  claimUrl: string;
  unsubscribeUrl?: string;
  links?: EmailLinks;
  dark?: boolean;
}

export const promoEmailSubject = (p: Pick<PromoEmailProps, "credits">) => `A gift for you: ${fmtNum(p.credits)} free credits`;

export function PromoEmail({ firstName, segmentReason, credits, code, expiresOn, claimUrl, unsubscribeUrl, links = PREVIEW_LINKS, dark = false }: PromoEmailProps) {
  const t = emailTheme(dark);
  const amount = fmtNum(credits);

  return (
    <EmailLayout dark={dark} preview={`Use your code before ${expiresOn}.`} tag="Just for you" marketing links={links} unsubscribeUrl={unsubscribeUrl} bodyPadding="0">
      <Section style={{ background: t.navy, padding: "40px", textAlign: "center" }}>
        <Text style={{ margin: "0 0 14px", fontSize: "14px", color: "#C3CFDC" }}>{segmentReason}</Text>
        <Text style={{ margin: "0 0 14px", fontFamily: FONT_DISPLAY, fontSize: "34px", fontWeight: 700, lineHeight: "1.1", color: "#F2F5F9" }}>{amount} free credits</Text>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "0 auto 14px" }}>
          <tbody>
            <tr>
              <td style={{ fontFamily: FONT_MONO, fontSize: "30px", fontWeight: 700, letterSpacing: "0.1em", padding: "12px 22px", borderRadius: "8px", border: "2px dashed #FF9900", color: "#FFB547" }}>
                {code}
              </td>
            </tr>
          </tbody>
        </table>
        <Text style={{ margin: 0, fontSize: "13px", color: "#A9B8C9" }}>Valid until {expiresOn} · for your account only</Text>
      </Section>

      <Section style={{ padding: "32px 40px 40px" }}>
        <P t={t} mb="20px">
          Hi {firstName}, use these credits to tailor your resume for your next few applications and check each one&apos;s ATS score before you send it.
        </P>
        <Actions align="center" mb="20px">
          <PrimaryButton t={t} href={claimUrl}>{`Add ${amount} credits`}</PrimaryButton>
        </Actions>
        <Section style={{ borderTop: `1px solid ${t.border}`, paddingTop: "16px" }}>
          <P t={t} size={12} mb="6px">
            • This code is personal and can be used once. It works even if you&apos;ve already used EARLYBIRD or a referral code.
          </P>
          <P t={t} size={12} mb="0">
            • Credits never expire once added. The code itself expires on {expiresOn}.
          </P>
        </Section>
      </Section>
    </EmailLayout>
  );
}

PromoEmail.PreviewProps = {
  firstName: "Asha",
  segmentReason: "Thanks for tailoring 3 resumes with us",
  credits: 1000,
  code: "ASHA-K7Q2",
  expiresOn: "31 Mar 2027",
  claimUrl: "https://app.resumepilot.app/wallet",
  unsubscribeUrl: "https://app.resumepilot.app/unsubscribe/preview",
} satisfies PromoEmailProps;

export default PromoEmail;
