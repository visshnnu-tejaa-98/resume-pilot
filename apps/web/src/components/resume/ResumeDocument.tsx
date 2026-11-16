import type { CSSProperties } from "react";
import type { ResumeDoc } from "@/features/versions/types";
import type { TemplateName } from "@/stores/preferences-store";

interface TemplateStyle {
  head: string;
  body: string;
  nameColor: string;
  headColor: string;
  rule: string;
  align: "left" | "center";
  track: string;
}

const SERIF = "var(--font-source-serif), 'Source Serif 4', Georgia, serif";
const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', Inter, sans-serif";
const SANS = "var(--font-inter), Inter, sans-serif";
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

/**
 * The five ATS-friendly templates (design/screens/Editor.dc.html). The
 * page is always white paper regardless of app theme. The PDF renderer
 * (packages/resume-templates, m9) must stay visually identical.
 */
export const TEMPLATE_STYLES: Record<TemplateName, TemplateStyle> = {
  Classic: { head: SERIF, body: SERIF, nameColor: "#111", headColor: "#111", rule: "1px solid #111", align: "center", track: "0" },
  Modern: { head: GROTESK, body: SANS, nameColor: "#0F1B2A", headColor: "#0A5BAD", rule: "2px solid #0A5BAD", align: "left", track: "-0.01em" },
  Minimal: { head: SANS, body: SANS, nameColor: "#111", headColor: "#555", rule: "0", align: "left", track: "0" },
  Professional: { head: SERIF, body: SANS, nameColor: "#0F1B2A", headColor: "#0F1B2A", rule: "1px solid #9AA8B8", align: "left", track: "0" },
  Technical: { head: MONO, body: SANS, nameColor: "#0F1B2A", headColor: "#0F1B2A", rule: "1px dashed #9AA8B8", align: "left", track: "0" },
};

interface ResumeDocumentProps {
  doc: ResumeDoc;
  template: TemplateName;
  /** `compact` = editor side preview; `page` = full-size preview. */
  scale?: "compact" | "page";
  hiddenSections?: Set<string>;
  zoom?: number;
}

/** A4 white page rendering of a resume. */
export function ResumeDocument({ doc, template, scale = "page", hiddenSections, zoom = 1 }: ResumeDocumentProps) {
  const p = TEMPLATE_STYLES[template];
  const page = scale === "page";
  const style: CSSProperties = {
    fontFamily: p.body,
    fontSize: (page ? 13 : 9.5) * zoom,
    lineHeight: page ? 1.5 : 1.45,
    padding: page ? `${56 * zoom}px ${60 * zoom}px` : `${36 * zoom}px ${38 * zoom}px`,
    gap: (page ? 18 : 12) * zoom,
    maxWidth: (page ? 794 : 520) * zoom,
  };
  return (
    <article
      aria-label={`Resume, ${template} template`}
      className="box-border flex aspect-[210/297] w-full flex-col overflow-hidden bg-white text-[#1A1A1A] shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
      style={style}
    >
      <div className="flex flex-col gap-1" style={{ textAlign: p.align }}>
        <span style={{ fontFamily: p.head, fontSize: (page ? 30 : 20) * zoom, fontWeight: 700, color: p.nameColor, letterSpacing: p.track }}>
          {doc.name}
        </span>
        <span style={{ fontSize: (page ? 12.5 : 9) * zoom, color: "#444" }}>{doc.contact}</span>
      </div>
      {doc.sections
        .filter((s) => !hiddenSections?.has(s.id))
        .map((s) => (
          <section key={s.id} className="flex flex-col" style={{ gap: (page ? 8 : 5) * zoom }}>
            <h2
              className="m-0 font-bold uppercase"
              style={{
                fontFamily: p.head,
                fontSize: (page ? 13.5 : 10) * zoom,
                letterSpacing: "0.08em",
                color: p.headColor,
                borderBottom: p.rule,
                paddingBottom: (page ? 3 : 2) * zoom,
              }}
            >
              {s.heading}
            </h2>
            {s.items.map((it, i) => (
              <div key={i} className="flex flex-col" style={{ gap: (page ? 3 : 2) * zoom }}>
                {it.title ? (
                  <div className="flex justify-between gap-2">
                    <strong>{it.title}</strong>
                    <span style={{ color: "#555" }}>{it.date}</span>
                  </div>
                ) : null}
                {it.lines.map((ln, j) => (
                  <span key={j}>{ln}</span>
                ))}
              </div>
            ))}
          </section>
        ))}
    </article>
  );
}
