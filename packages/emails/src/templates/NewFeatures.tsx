/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Section, Text } from "@react-email/components";
import { Actions, H1, P, PrimaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { type EmailTheme, emailTheme, FONT_DISPLAY, FONT_MONO } from "../components/theme";

/** Small illustration above each feature (drawn with text + tables). */
export type FeatureVisual =
  | { kind: "compare"; from: number; to: number }
  | { kind: "rescore" }
  | { kind: "code"; code: string; caption: string };

export interface FeatureItem {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  visual?: FeatureVisual;
}

export interface NewFeaturesEmailProps {
  firstName: string;
  /** e.g. "NOVEMBER 2026". */
  monthLabel: string;
  headline: string;
  /** Up to three features (prd.md §13.4). */
  features: FeatureItem[];
  unsubscribeUrl: string;
  /** Inbox preview text; set per campaign (prd.md §13.3). */
  preheader?: string;
  links: EmailLinks;
  dark?: boolean;
}

export const newFeaturesEmailSubject = (p: Pick<NewFeaturesEmailProps, "features">) =>
  `New in Resume Pilot: ${p.features.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join(", ")}`;

const arrow = (t: EmailTheme) => <span style={{ color: t.text2, fontSize: "20px", padding: "0 12px" }}>→</span>;

function Visual({ t, v }: { t: EmailTheme; v: FeatureVisual }) {
  const pill = (bg: string, fg: string, text: string, extra: object = {}) => (
    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "999px", background: bg, color: fg, fontSize: "12px", fontWeight: 700, ...extra }}>{text}</span>
  );
  return (
    <Section style={{ background: t.soft, borderRadius: "10px", padding: "26px 18px", textAlign: "center", marginBottom: "14px" }}>
      {v.kind === "compare" ? (
        <Text style={{ margin: 0, fontFamily: FONT_MONO, fontSize: "26px", fontWeight: 600, color: t.text }}>
          <span style={{ color: t.text2 }}>{v.from}</span>
          {arrow(t)}
          {v.to}
          <span style={{ paddingLeft: "12px" }}>{pill(t.goodBg, t.good, `+${v.to - v.from}`, { fontSize: "13px", borderRadius: "6px", fontFamily: FONT_MONO })}</span>
        </Text>
      ) : v.kind === "rescore" ? (
        <Text style={{ margin: 0 }}>
          {pill(t.warnBg, t.warn, "Score outdated")}
          {arrow(t)}
          {pill(t.accent, t.onAccent, "Re-score", { borderRadius: "6px", padding: "8px 14px", fontSize: "13px" })}
        </Text>
      ) : (
        <Text style={{ margin: 0, fontSize: "13px", color: t.text2 }}>
          <span style={{ display: "inline-block", fontFamily: FONT_MONO, fontSize: "20px", fontWeight: 700, letterSpacing: "0.08em", padding: "8px 14px", borderRadius: "8px", border: `2px dashed ${t.accentLine}`, color: t.text, marginRight: "12px" }}>
            {v.code}
          </span>
          {v.caption}
        </Text>
      )}
    </Section>
  );
}

/** design/screens/EmailNewFeatures — marketing campaign. */
export function NewFeaturesEmail(p: NewFeaturesEmailProps) {
  const { dark = false, links } = p;
  const t = emailTheme(dark);
  const features = p.features.slice(0, 3);
  return (
    <EmailLayout
      dark={dark}
      preview={p.preheader || `${features.length} updates to help you send stronger applications.`}
      tag="Product update"
      marketing
      links={links}
      unsubscribeUrl={p.unsubscribeUrl}
    >
      <Text style={{ margin: "0 0 10px", fontFamily: FONT_MONO, fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", color: t.accentText }}>
        WHAT&apos;S NEW · {p.monthLabel}
      </Text>
      <H1 t={t} size={28} mb="10px">
        {p.headline}
      </H1>
      <P t={t} mb="8px">
        Hi {p.firstName}, here&apos;s what we shipped this month.
      </P>
      {features.map((f, i) => (
        <Section key={f.title} style={{ padding: "22px 0", borderTop: i > 0 ? `1px solid ${t.border}` : undefined }}>
          {f.visual ? <Visual t={t} v={f.visual} /> : null}
          <Text style={{ margin: "0 0 6px", fontFamily: FONT_DISPLAY, fontSize: "19px", fontWeight: 700, color: t.text }}>{f.title}</Text>
          <Text style={{ margin: "0 0 6px", fontSize: "14px", lineHeight: "1.65", color: t.text2 }}>{f.body}</Text>
          <Link href={f.ctaUrl} style={{ fontSize: "14px", fontWeight: 600, color: t.link }}>
            {f.ctaLabel}
          </Link>
        </Section>
      ))}
      <Actions align="center" mb="12px">
        <PrimaryButton t={t} href={links.dashboardUrl}>
          Open Resume Pilot
        </PrimaryButton>
      </Actions>
      <P t={t} size={13} align="center" mb="0">
        Got an idea for us? Just reply to this email.
      </P>
    </EmailLayout>
  );
}

NewFeaturesEmail.PreviewProps = {
  firstName: "Asha",
  monthLabel: "NOVEMBER 2026",
  headline: "Three new ways to get your resume interview-ready",
  features: [
    {
      title: "Compare original vs tailored",
      body: "See both ATS scores side by side, the change in each category, and the keywords you gained. Free when both scores are saved.",
      ctaLabel: "Try a comparison",
      ctaUrl: "https://app.resumepilot.app/resumes",
      visual: { kind: "compare", from: 61, to: 82 },
    },
    {
      title: "Re-score after your edits",
      body: "Edited a tailored resume by hand? Its score is marked outdated so you know to re-score before you apply.",
      ctaLabel: "See how scoring works",
      ctaUrl: "https://app.resumepilot.app/faq",
      visual: { kind: "rescore" },
    },
    {
      title: "Invite friends, they get 100 credits",
      body: "Share your referral code. Friends who sign up with it get free credits.",
      ctaLabel: "Get your referral code",
      ctaUrl: "https://app.resumepilot.app/referrals",
      visual: { kind: "code", code: "RP-7K3XQ", caption: "= 100 credits for a friend" },
    },
  ],
  unsubscribeUrl: "https://app.resumepilot.app/unsubscribe/preview",
  links: PREVIEW_LINKS,
} satisfies NewFeaturesEmailProps;

export default NewFeaturesEmail;
