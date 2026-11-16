/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Section, Text } from "@react-email/components";
import { Actions, GAP, H1, NavyStats, P, PrimaryButton } from "../components/blocks";
import { EmailLayout } from "../components/EmailLayout";
import { PREVIEW_LINKS, type EmailLinks } from "../components/links";
import { emailTheme, fmtNum } from "../components/theme";

export interface InactiveNudgeEmailProps {
  firstName: string;
  balance: number;
  tailoredVersions: number;
  bestScore: number | null;
  savedJobs: number;
  /** Optional personal nudge, e.g. a version with an outdated score. */
  pickUp?: { title: string; body: string } | null;
  unsubscribeUrl: string;
  links: EmailLinks;
  dark?: boolean;
}

export const inactiveNudgeEmailSubject = () => "Your resumes are ready for the next application";

/** design/screens/EmailInactive — marketing, respects opt-out (prd.md §13.3). */
export function InactiveNudgeEmail(p: InactiveNudgeEmailProps) {
  const { dark = false, links } = p;
  const t = emailTheme(dark);
  const preview = p.balance > 0 ? `You still have ${fmtNum(p.balance)} credits. They never expire.` : "Paste your next job and tailor in about a minute.";

  return (
    <EmailLayout dark={dark} preview={preview} marketing links={links} unsubscribeUrl={p.unsubscribeUrl}>
      <H1 t={t} size={28}>
        Found a new job to apply for, {p.firstName}?
      </H1>
      <P t={t}>Everything is where you left it. Paste the next job description and you&apos;ll have a tailored resume in about a minute.</P>
      <NavyStats
        t={t}
        title="Your Resume Pilot at a glance"
        stats={[
          { label: "Credits in your wallet", value: fmtNum(p.balance), color: "#FFB547" },
          { label: "Tailored versions", value: fmtNum(p.tailoredVersions) },
          { label: "Best ATS score", value: p.bestScore === null ? "—" : String(p.bestScore), color: "#4CC38A" },
          { label: "Saved job descriptions", value: fmtNum(p.savedJobs) },
        ]}
      />
      {p.pickUp ? (
        <Section style={{ border: `1px solid ${t.border}`, borderRadius: "10px", padding: "16px 18px", marginBottom: GAP }}>
          <Text style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: 700, color: t.text }}>{p.pickUp.title}</Text>
          <Text style={{ margin: 0, fontSize: "14px", lineHeight: "1.55", color: t.text2 }}>{p.pickUp.body}</Text>
        </Section>
      ) : null}
      <Actions>
        <PrimaryButton t={t} href={links.generateUrl}>
          Tailor for a new job
        </PrimaryButton>
      </Actions>
      <P t={t} size={13} mb="0">
        Not job hunting right now?{" "}
        <Link href={links.preferencesUrl} style={{ color: t.link }}>
          Pause these reminders
        </Link>
        .
      </P>
    </EmailLayout>
  );
}

InactiveNudgeEmail.PreviewProps = {
  firstName: "Asha",
  balance: 9770,
  tailoredVersions: 3,
  bestScore: 82,
  savedJobs: 4,
  pickUp: { title: "Pick up where you left off", body: "Your Globex resume was edited after its last score. A quick re-score shows where it stands now." },
  unsubscribeUrl: "https://app.resumepilot.app/unsubscribe/preview",
  links: PREVIEW_LINKS,
} satisfies InactiveNudgeEmailProps;

export default InactiveNudgeEmail;
