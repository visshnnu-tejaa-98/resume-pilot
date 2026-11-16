/** @jsxRuntime automatic @jsxImportSource react */
import { Link, Section, Text } from "@react-email/components";
import { FONT_SANS } from "./theme";

export function EmailFooter({
  dark,
  marketing,
  unsubscribeUrl,
}: {
  dark: boolean;
  marketing: boolean;
  unsubscribeUrl?: string;
}) {
  const muted = dark ? "#8193A8" : "#5E6E80";
  const link = dark ? "#5AABFF" : "#0A6BCB";

  return (
    <Section
      style={{
        width: "600px",
        boxSizing: "border-box",
        padding: "28px 32px 32px",
        fontFamily: FONT_SANS,
        fontSize: "12px",
        lineHeight: "1.6",
        color: muted,
        textAlign: "center",
      }}
    >
      <Text style={{ margin: "0 0 14px", fontWeight: 600 }}>
        <Link href="#" style={{ color: link, marginRight: "18px" }}>
          Help centre
        </Link>
        <Link href="#" style={{ color: link, marginRight: "18px" }}>
          Your wallet
        </Link>
        <Link href="#" style={{ color: link }}>
          Privacy
        </Link>
      </Text>
      <Text style={{ margin: "0 0 14px" }}>
        Questions? Reply to this email or write to support@resumepilot.app.
      </Text>
      {marketing ? (
        <Text style={{ margin: "0 0 14px" }}>
          You&apos;re getting this because you have a Resume Pilot account and opted in to updates.{" "}
          <Link href={unsubscribeUrl ?? "#"} style={{ color: link }}>
            Unsubscribe
          </Link>{" "}
          ·{" "}
          <Link href="#" style={{ color: link }}>
            Email preferences
          </Link>
        </Text>
      ) : (
        <Text style={{ margin: "0 0 14px" }}>
          This is a service email about your account, so it&apos;s sent even if you&apos;ve turned
          off updates.
        </Text>
      )}
      <Text style={{ margin: 0 }}>Resume Pilot · Bengaluru, India</Text>
    </Section>
  );
}
