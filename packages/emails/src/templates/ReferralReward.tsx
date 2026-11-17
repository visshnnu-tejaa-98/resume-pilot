/** @jsxRuntime automatic @jsxImportSource react */
import { Section, Text } from "@react-email/components";
import { Actions, DetailTable, H1, P, PrimaryButton, SecondaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum, FONT_MONO } from "../components/theme";

export interface ReferralRewardEmailProps {
  firstName: string;
  credits: number;
  newBalance: number;
  referralCode: string;
  /** Share link, e.g. https://app…/sign-up?code=ASHA42. */
  shareUrl: string;
  /** Pre-formatted in IST. */
  grantedAt: string;
  links: EmailLinks;
  dark?: boolean;
}

export const referralRewardEmailSubject = (p: Pick<ReferralRewardEmailProps, "credits">) => `Your friend joined: ${fmtNum(p.credits)} credits for you`;

/** prd.md §13.1 `referral_reward` — transactional, once per referral. The friend is never named (privacy). */
export function ReferralRewardEmail({ firstName, credits, newBalance, referralCode, shareUrl, grantedAt, links, dark = false }: ReferralRewardEmailProps) {
  const t = emailTheme(dark);
  return (
    <EmailLayout dark={dark} preview={`A friend used your code ${referralCode}. ${fmtNum(credits)} credits added.`} tag="Referral reward" marketing={false} links={links}>
      <Section style={{ textAlign: "center" }}>
        <Text style={{ margin: "0 0 10px", fontFamily: FONT_MONO, fontSize: "44px", fontWeight: 700, color: t.good }}>+{fmtNum(credits)}</Text>
        <H1 t={t} align="center" mb="10px">
          Your friend joined with your code, {firstName}
        </H1>
        <P t={t} align="center">
          Thanks for spreading the word. We&apos;ve added {fmtNum(credits)} credits to your wallet.
        </P>
      </Section>
      <DetailTable
        t={t}
        rows={[
          { k: "Your code", v: referralCode },
          { k: "Credits added", v: `+${fmtNum(credits)}` },
          { k: "New balance", v: `${fmtNum(newBalance)} credits`, highlight: true, strong: true },
          { k: "Added", v: grantedAt },
        ]}
      />
      <P t={t} size={14}>
        Every friend who signs up with your code gets {fmtNum(credits)} credits to start, and you get {fmtNum(credits)} more.
      </P>
      <Actions align="center">
        <PrimaryButton t={t} href={shareUrl}>
          Share your link
        </PrimaryButton>
        <SecondaryButton t={t} href={links.referralsUrl}>
          See your referrals
        </SecondaryButton>
      </Actions>
    </EmailLayout>
  );
}

ReferralRewardEmail.PreviewProps = {
  firstName: "Asha",
  credits: 100,
  newBalance: 600,
  referralCode: "ASHA42",
  shareUrl: "https://app.resumepilot.app/sign-up?code=ASHA42",
  grantedAt: "12 Nov 2026, 5:40 pm IST",
  links: PREVIEW_LINKS,
} satisfies ReferralRewardEmailProps;

export default ReferralRewardEmail;
