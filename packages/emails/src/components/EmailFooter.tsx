/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Section, Text } from "@react-email/components";
import type { EmailLinks } from "./links";
import { emailTheme, FONT_SANS } from "./theme";

/**
 * Footer under the card (design/screens/EmailFooter). Marketing mail
 * carries unsubscribe + preferences links (prd.md §13.5); transactional
 * mail explains why it's still sent.
 */
export function EmailFooter({
  dark,
  marketing,
  links,
  unsubscribeUrl,
}: {
  dark: boolean;
  marketing: boolean;
  links: EmailLinks;
  unsubscribeUrl?: string;
}) {
  const t = emailTheme(dark);
  const a = { color: t.link };
  const p = { margin: "0 0 14px" };

  return (
    <Section style={{ padding: "28px 32px 32px", fontFamily: FONT_SANS, fontSize: "12px", lineHeight: "1.6", color: t.muted, textAlign: "center" }}>
      <Text style={{ ...p, fontSize: "12px", fontWeight: 600 }}>
        <Link href={links.helpUrl} style={{ ...a, marginRight: "18px" }}>
          Help centre
        </Link>
        <Link href={links.walletUrl} style={{ ...a, marginRight: "18px" }}>
          Your wallet
        </Link>
        <Link href={links.privacyUrl} style={a}>
          Privacy
        </Link>
      </Text>
      <Text style={{ ...p, fontSize: "12px", color: t.muted }}>Questions? Reply to this email or write to {links.supportEmail}.</Text>
      {marketing ? (
        <Text style={{ ...p, fontSize: "12px", color: t.muted }}>
          You&apos;re getting this because you have a Resume Pilot account and opted in to updates.{" "}
          <Link href={unsubscribeUrl ?? links.preferencesUrl} style={a}>
            Unsubscribe
          </Link>{" "}
          ·{" "}
          <Link href={links.preferencesUrl} style={a}>
            Email preferences
          </Link>
        </Text>
      ) : (
        <Text style={{ ...p, fontSize: "12px", color: t.muted }}>
          This is a service email about your account, so it&apos;s sent even if you&apos;ve turned off updates.
        </Text>
      )}
      <Text style={{ margin: 0, fontSize: "12px", color: t.muted }}>Resume Pilot · {links.address}</Text>
    </Section>
  );
}
