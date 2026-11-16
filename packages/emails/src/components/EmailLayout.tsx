/** @jsxRuntime automatic @jsxImportSource react */
import { Body, Container, Head, Html, Preview, Section } from "@react-email/components";
import type { ReactNode } from "react";
import { EmailFooter } from "./EmailFooter";
import { EmailHeader } from "./EmailHeader";
import type { EmailLinks } from "./links";
import { emailTheme, FONT_SANS } from "./theme";

export interface EmailLayoutProps {
  dark: boolean;
  /** Inbox preheader text. */
  preview: string;
  /** Short label on the right of the header bar. */
  tag?: string;
  marketing: boolean;
  links: EmailLinks;
  unsubscribeUrl?: string;
  /** Override the card body padding (New features uses section rhythm). */
  bodyPadding?: string;
  children: ReactNode;
}

/** 600px card on a tinted canvas: header, body, footer. */
export function EmailLayout({ dark, preview, tag, marketing, links, unsubscribeUrl, bodyPadding = "36px 40px 40px", children }: EmailLayoutProps) {
  const t = emailTheme(dark);
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content={dark ? "dark" : "light"} />
        <meta name="supported-color-schemes" content={dark ? "dark" : "light"} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, background: t.outer, fontFamily: FONT_SANS, color: t.text }}>
        <Container style={{ width: "100%", maxWidth: "600px", padding: "24px 0" }}>
          <Section style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "12px", overflow: "hidden" }}>
            <EmailHeader dark={dark} tag={tag} logoUrl={links.logoUrl} />
            <Section style={{ padding: bodyPadding }}>{children}</Section>
          </Section>
          <EmailFooter dark={dark} marketing={marketing} links={links} unsubscribeUrl={unsubscribeUrl} />
        </Container>
      </Body>
    </Html>
  );
}
