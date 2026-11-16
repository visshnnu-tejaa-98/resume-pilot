/** @jsxRuntime automatic @jsxImportSource react */
import { Section, Text } from "@react-email/components";
import { Actions, DetailTable, H1, P, PrimaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum, FONT_MONO } from "../components/theme";

export interface CodeAppliedEmailProps {
  firstName: string;
  code: string;
  credits: number;
  newBalance: number;
  /** Pre-formatted in IST, e.g. "12 Nov 2026, 5:40 pm IST". */
  appliedAt: string;
  links: EmailLinks;
  dark?: boolean;
}

export const codeAppliedEmailSubject = (p: Pick<CodeAppliedEmailProps, "credits">) => `${fmtNum(p.credits)} credits added to your wallet`;

/** design/screens/EmailCodeApplied — transactional. */
export function CodeAppliedEmail({ firstName, code, credits, newBalance, appliedAt, links, dark = false }: CodeAppliedEmailProps) {
  const t = emailTheme(dark);
  return (
    <EmailLayout dark={dark} preview={`${code} is applied. Your credits never expire.`} tag="Wallet update" marketing={false} links={links}>
      <Section style={{ textAlign: "center" }}>
        <Text style={{ margin: "0 0 10px", fontFamily: FONT_MONO, fontSize: "44px", fontWeight: 700, color: t.good }}>+{fmtNum(credits)}</Text>
        <H1 t={t} align="center" mb="10px">
          Your code worked, {firstName}
        </H1>
        <P t={t} align="center">
          We&apos;ve added {fmtNum(credits)} free credits to your wallet.
        </P>
      </Section>
      <DetailTable
        t={t}
        rows={[
          { k: "Code", v: code },
          { k: "Credits added", v: `+${fmtNum(credits)}` },
          { k: "New balance", v: `${fmtNum(newBalance)} credits`, highlight: true, strong: true },
          { k: "Applied", v: appliedAt },
        ]}
      />
      <P t={t} size={14}>
        Use your credits for job description analysis, tailored resumes and ATS scores. Before anything runs you&apos;ll see the estimate, and you only pay
        what&apos;s used.
      </P>
      <Actions align="center">
        <PrimaryButton t={t} href={links.generateUrl}>
          Tailor a resume
        </PrimaryButton>
      </Actions>
      <P t={t} size={12} align="center" mb="0">
        Each account can use one coupon or referral code. Didn&apos;t apply this code? Reply to this email.
      </P>
    </EmailLayout>
  );
}

CodeAppliedEmail.PreviewProps = {
  firstName: "Asha",
  code: "EARLYBIRD",
  credits: 500,
  newBalance: 500,
  appliedAt: "12 Nov 2026, 5:40 pm IST",
  links: PREVIEW_LINKS,
} satisfies CodeAppliedEmailProps;

export default CodeAppliedEmail;
