import type { Resume } from "@resume-pilot/validators/resume";

/**
 * Resume JSON → the page model every template renders. Honours the layout:
 * section order, hidden sections and hidden items. Item and bullet ids are
 * kept so the preview can link back to the editor.
 */

export interface DocLine {
  id?: string;
  text: string;
  bullet?: boolean;
}
/** A clickable link on the page; `label` is the visible (ATS-readable) text. */
export interface DocLink {
  href: string;
  label: string;
}
export interface DocItem {
  id?: string;
  title?: string;
  subtitle?: string;
  link?: DocLink;
  date?: string;
  lines: DocLine[];
  /** Skill names, rendered as a row (Technical shows them as tags). */
  tags?: string[];
  tagLabel?: string;
}
export interface DocSection {
  key: string;
  heading: string;
  items: DocItem[];
}
export interface ResumeDoc {
  name: string;
  headline: string;
  /** Header contact rows: personal details first, then links (each row is its own line). */
  contact: { text: string; href?: string }[][];
  sections: DocSection[];
}

export const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  workExperience: "Work experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
};

/** Summary paragraphs: blank lines in the text separate them. */
const summaryParagraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Standard, ATS-recognised headings on the page. */
const HEADINGS: Record<string, string> = { ...SECTION_LABELS, workExperience: "Experience" };

const range = (a: { raw: string }, b: { raw: string }, current = false) => [a.raw, current ? "Present" : b.raw].filter(Boolean).join(" – ");
/** Only http(s)/mailto links are rendered as anchors; bare domains get https://. */
export function toLink(raw: string | undefined | null): DocLink | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  const href = /^(https?:|mailto:)/i.test(v) ? v : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? `https://${v}` : null;
  if (!href || /^\s*javascript:/i.test(href)) return undefined;
  return { href, label: v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "") };
}

const join = (...xs: (string | undefined | null)[]) => xs.filter(Boolean).join(", ");

export function resumeToDoc(r: Resume): ResumeDoc {
  const hiddenItems = new Set(r.layout.hiddenItems);
  const hiddenSections = new Set<string>(r.layout.hiddenSections);
  const visible = <T extends { id: string }>(items: T[]) => items.filter((i) => !hiddenItems.has(i.id));
  const bullets = (b: { id: string; text: string }[]): DocLine[] => visible(b).filter((x) => x.text.trim()).map((x) => ({ id: x.id, text: x.text, bullet: true }));

  const build = (key: string): DocSection | null => {
    const heading = HEADINGS[key] ?? "";
    switch (key) {
      case "summary":
        return r.summary.text.trim() ? { key, heading, items: [{ id: "summary", lines: summaryParagraphs(r.summary.text).map((text) => ({ text })) }] } : null;
      case "workExperience":
        return {
          key,
          heading,
          items: visible(r.workExperience).map((w) => ({ id: w.id, title: w.designation, subtitle: join(w.company, w.location), date: range(w.startDate, w.endDate, w.isCurrent), lines: bullets(w.bullets) })),
        };
      case "projects":
        return {
          key,
          heading,
          items: visible(r.projects).map((p) => ({
            id: p.id,
            title: p.name,
            subtitle: p.role || undefined,
            link: toLink(p.url),
            date: range(p.startDate, p.endDate),
            lines: [...bullets(p.bullets), ...(p.technologies.length ? [{ text: `Technologies: ${p.technologies.join(", ")}` }] : [])],
          })),
        };
      case "skills":
        return {
          key,
          heading,
          items: visible(r.skills)
            .map((g) => ({ g, names: visible(g.items).map((i) => i.name).filter(Boolean) }))
            .filter((x) => x.names.length)
            .map(({ g, names }) => ({ id: g.id, tagLabel: g.category || undefined, tags: names, lines: [] })),
        };
      case "education":
        return {
          key,
          heading,
          items: visible(r.education).map((e) => ({
            id: e.id,
            title: [e.degree, e.fieldOfStudy].filter(Boolean).join(", "),
            subtitle: join(e.institution, e.location),
            date: range(e.startDate, e.endDate),
            lines: [...(e.grade.value ? [{ text: `Grade: ${e.grade.value}${e.grade.scale && e.grade.scale !== "other" ? ` ${e.grade.scale}` : ""}` }] : []), ...bullets(e.bullets)],
          })),
        };
      case "certifications":
        return {
          key,
          heading,
          items: visible(r.certifications).map((c) => ({ id: c.id, title: c.name, subtitle: join(c.issuer, c.credentialId && `ID ${c.credentialId}`), link: toLink(c.credentialUrl), date: c.issueDate.raw, lines: [] })),
        };
      default: {
        const id = key.startsWith("custom:") ? key.slice(7) : "";
        const c = r.customSections.find((s) => s.id === id);
        if (!c) return null;
        return { key, heading: c.title || "Additional", items: visible(c.items).map((i) => ({ id: i.id, title: i.heading, subtitle: i.subheading, link: toLink(i.url), date: i.date.raw, lines: bullets(i.bullets) })) };
      }
    }
  };

  const order = [...r.layout.sectionOrder, ...r.customSections.map((c) => `custom:${c.id}`).filter((k) => !(r.layout.sectionOrder as string[]).includes(k))];
  const sections = order
    .filter((k) => !hiddenSections.has(k))
    .map(build)
    .filter((s): s is DocSection => !!s && s.items.length > 0);

  const p = r.personalInfo;
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Your name",
    headline: p.headline,
    contact: [
      [
        p.location ? { text: p.location } : null,
        p.email ? { text: p.email, href: `mailto:${p.email.trim()}` } : null,
        p.phone ? { text: p.phone, href: `tel:${p.phone.replace(/[^\d+]/g, "")}` } : null,
      ],
      p.links.map((l) => {
        const link = toLink(l.url);
        return link ? { text: link.label, href: link.href } : null;
      }),
    ]
      .map((row) => row.filter((c): c is { text: string; href?: string } => !!c))
      .filter((row) => row.length > 0),
    sections,
  };
}
