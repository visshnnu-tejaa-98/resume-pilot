/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { type EmailTheme, FONT_DISPLAY, FONT_MONO } from "./theme";

/*
 * Email-safe building blocks: table layout, inline styles, no SVG, no
 * flex/grid. Every block takes the theme so light and dark render alike.
 */

export const GAP = "22px";

export function H1({ t, children, size = 26, align, mb = GAP }: { t: EmailTheme; children: ReactNode; size?: number; align?: "center"; mb?: string }) {
  return (
    <Text style={{ margin: `0 0 ${mb}`, fontFamily: FONT_DISPLAY, fontSize: `${size}px`, lineHeight: "1.2", fontWeight: 700, color: t.text, textAlign: align }}>
      {children}
    </Text>
  );
}

export function P({ t, children, size = 15, muted = true, align, mb = GAP, style }: { t: EmailTheme; children: ReactNode; size?: number; muted?: boolean; align?: "center"; mb?: string; style?: CSSProperties }) {
  return (
    <Text style={{ margin: `0 0 ${mb}`, fontSize: `${size}px`, lineHeight: size >= 15 ? "1.7" : "1.6", color: muted ? t.text2 : t.text, textAlign: align, ...style }}>
      {children}
    </Text>
  );
}

export function PrimaryButton({ t, href, children }: { t: EmailTheme; href: string; children: string }) {
  return (
    <Button href={href} style={{ padding: "14px 26px", borderRadius: "6px", background: t.accent, color: t.onAccent, fontWeight: 700, fontSize: "15px" }}>
      {children}
    </Button>
  );
}

export function SecondaryButton({ t, href, children }: { t: EmailTheme; href: string; children: string }) {
  return (
    <Button href={href} style={{ padding: "13px 22px", borderRadius: "6px", border: `1px solid ${t.text}`, color: t.text, fontWeight: 600, fontSize: "15px" }}>
      {children}
    </Button>
  );
}

/** One or two buttons in a row, left or centred. */
export function Actions({ children, align = "left", mb = GAP }: { children: ReactNode; align?: "left" | "center"; mb?: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} align={align === "center" ? "center" : undefined} style={{ marginBottom: mb }}>
      <tbody>
        <tr>
          {items.map((c, i) => (
            <td key={i} style={{ paddingRight: i < items.length - 1 ? "12px" : 0 }}>
              {c}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export interface DetailRow {
  k: string;
  v: ReactNode;
  strong?: boolean;
  highlight?: boolean;
}

/** Bordered key/value table (receipts, code details). */
export function DetailTable({ t, rows, title, mb = GAP }: { t: EmailTheme; rows: DetailRow[]; title?: string; mb?: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ border: `1px solid ${t.border}`, borderRadius: "10px", borderCollapse: "separate", marginBottom: mb, overflow: "hidden" }}>
      <tbody>
        {title ? (
          <tr>
            <td colSpan={2} style={{ padding: "12px 18px", background: t.soft, fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.text2 }}>
              {title}
            </td>
          </tr>
        ) : null}
        {rows.map((r, i) => {
          const top = i > 0 || title ? `1px solid ${t.border}` : "none";
          const cell: CSSProperties = { padding: "12px 18px", borderTop: top, fontSize: "14px", background: r.highlight ? t.soft : undefined };
          return (
            <tr key={r.k}>
              <td style={{ ...cell, color: t.text2 }}>{r.k}</td>
              <td style={{ ...cell, textAlign: "right", fontFamily: FONT_MONO, fontWeight: r.strong ? 700 : 500, color: t.text }}>{r.v}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const NOTICE = { info: ["infoBg", "info", "i"], warn: ["warnBg", "warn", "!"], good: ["goodBg", "good", "✓"] } as const;

/** Tinted notice with a small glyph badge. */
export function Notice({ t, tone, children, mb = GAP }: { t: EmailTheme; tone: keyof typeof NOTICE; children: ReactNode; mb?: string }) {
  const [bg, fg, glyph] = NOTICE[tone];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ background: t[bg], borderRadius: "8px", marginBottom: mb, border: tone === "warn" ? `1px solid ${t.warnLine}` : undefined }}>
      <tbody>
        <tr>
          <td style={{ width: "20px", padding: "14px 0 14px 16px", verticalAlign: "top" }}>
            <span style={{ display: "inline-block", width: "18px", height: "18px", lineHeight: "18px", borderRadius: "999px", border: `2px solid ${t[fg]}`, color: t[fg], fontSize: "11px", fontWeight: 700, textAlign: "center" }}>
              {glyph}
            </span>
          </td>
          <td style={{ padding: "14px 16px 14px 12px", fontSize: "14px", lineHeight: "1.55", color: t.text }}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Round status badge + title + subline (payment results). */
export function StatusHeading({ t, tone, title, sub }: { t: EmailTheme; tone: "good" | "crit"; title: string; sub: string }) {
  const bg = tone === "good" ? t.goodBg : t.critBg;
  const fg = tone === "good" ? t.good : t.crit;
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ marginBottom: GAP }}>
      <tbody>
        <tr>
          <td style={{ width: "52px", verticalAlign: "middle" }}>
            <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "52px", height: "52px", borderRadius: "999px", background: bg }}>
              <tbody>
                <tr>
                  <td align="center" style={{ fontSize: "24px", lineHeight: "52px", fontWeight: 700, color: fg }}>
                    {tone === "good" ? "✓" : "✕"}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td style={{ paddingLeft: "16px", verticalAlign: "middle" }}>
            <Text style={{ margin: "0 0 4px", fontFamily: FONT_DISPLAY, fontSize: "26px", lineHeight: "1.2", fontWeight: 700, color: t.text }}>{title}</Text>
            <Text style={{ margin: 0, fontSize: "15px", color: t.text2 }}>{sub}</Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Navy panel with label/value stats laid out in columns. */
export function NavyStats({
  t,
  title,
  stats,
  columns = 2,
  labelFirst = false,
  mb = GAP,
}: {
  t: EmailTheme;
  title?: string;
  stats: { label: string; value: string; color?: string; align?: "right" }[];
  columns?: number;
  /** Small label above a big value (receipt) vs value above label (at-a-glance). */
  labelFirst?: boolean;
  mb?: string;
}) {
  const rows: (typeof stats)[] = [];
  for (let i = 0; i < stats.length; i += columns) rows.push(stats.slice(i, i + columns));
  return (
    <Section style={{ background: t.navy, borderRadius: "10px", padding: "22px", marginBottom: mb }}>
      {title ? <Text style={{ margin: "0 0 14px", fontSize: "13px", fontWeight: 600, color: "#A9B8C9" }}>{title}</Text> : null}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((s) => (
                <td key={s.label} style={{ width: `${100 / columns}%`, padding: ri > 0 ? "14px 0 0" : 0, verticalAlign: "top", textAlign: s.align ?? "left" }}>
                  {labelFirst ? (
                    <>
                      <Text style={{ margin: "0 0 4px", fontSize: "13px", color: "#A9B8C9" }}>{s.label}</Text>
                      <Text style={{ margin: 0, fontFamily: FONT_MONO, fontSize: s.align ? "22px" : "30px", fontWeight: 600, color: s.color ?? "#F2F5F9" }}>{s.value}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ margin: "0 0 2px", fontFamily: FONT_MONO, fontSize: "24px", fontWeight: 600, color: s.color ?? "#F2F5F9" }}>{s.value}</Text>
                      <Text style={{ margin: 0, fontSize: "13px", color: "#C3CFDC" }}>{s.label}</Text>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** "• tip" list. */
export function Bullets({ t, title, items, mb = GAP }: { t: EmailTheme; title?: string; items: string[]; mb?: string }) {
  return (
    <Section style={{ marginBottom: mb }}>
      {title ? <Text style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 700, color: t.text }}>{title}</Text> : null}
      {items.map((i) => (
        <Text key={i} style={{ margin: "0 0 6px", fontSize: "14px", lineHeight: "1.55", color: t.text2 }}>
          • {i}
        </Text>
      ))}
    </Section>
  );
}
