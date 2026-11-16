import type { Resume } from "@resume-pilot/validators/resume";
import type { DocSection, ResumeDoc } from "./types";

/**
 * Resume JSON → the page layout the preview renders (and, in m9, the PDF
 * template mirrors). Honours the layout: section order, hidden sections
 * and hidden items (e.g. projects the generation chose not to show).
 */

const range = (a: { raw: string }, b: { raw: string }, current = false) =>
  [a.raw, current ? "Present" : b.raw].filter(Boolean).join(" – ");

export const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  workExperience: "Work experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
};

export function resumeToDoc(r: Resume): ResumeDoc {
  const hiddenItems = new Set(r.layout.hiddenItems);
  const hiddenSections = new Set(r.layout.hiddenSections);
  const visible = <T extends { id: string }>(items: T[]) => items.filter((i) => !hiddenItems.has(i.id));
  const bullets = (b: { id: string; text: string }[]) => visible(b).map((x) => `• ${x.text}`);

  const build = (key: string): DocSection | null => {
    switch (key) {
      case "summary":
        return r.summary.text ? { id: key, heading: "Summary", items: [{ lines: [r.summary.text] }] } : null;
      case "workExperience":
        return {
          id: key,
          heading: "Experience",
          items: visible(r.workExperience).map((w) => ({
            title: [w.designation, w.company].filter(Boolean).join(" · "),
            date: range(w.startDate, w.endDate, w.isCurrent),
            lines: bullets(w.bullets),
          })),
        };
      case "projects":
        return {
          id: key,
          heading: "Projects",
          items: visible(r.projects).map((p) => ({ title: [p.name, p.role].filter(Boolean).join(" · "), date: range(p.startDate, p.endDate), lines: bullets(p.bullets) })),
        };
      case "skills":
        return {
          id: key,
          heading: "Skills",
          items: r.skills
            .map((g) => ({ g, names: visible(g.items).map((i) => i.name) }))
            .filter((x) => x.names.length)
            .map(({ g, names }) => ({ lines: [r.skills.length > 1 && g.category ? `${g.category}: ${names.join(" · ")}` : names.join(" · ")] })),
        };
      case "education":
        return {
          id: key,
          heading: "Education",
          items: visible(r.education).map((e) => ({
            title: [[e.degree, e.fieldOfStudy].filter(Boolean).join(", "), e.institution].filter(Boolean).join(" · "),
            date: range(e.startDate, e.endDate),
            lines: [...(e.grade.value ? [`Grade: ${e.grade.value}${e.grade.scale && e.grade.scale !== "other" ? ` ${e.grade.scale}` : ""}`] : []), ...bullets(e.bullets)],
          })),
        };
      case "certifications":
        return {
          id: key,
          heading: "Certifications",
          items: visible(r.certifications).map((c) => ({ title: [c.name, c.issuer].filter(Boolean).join(" · "), date: c.issueDate.raw, lines: [] })),
        };
      default: {
        const id = key.startsWith("custom:") ? key.slice(7) : "";
        const c = r.customSections.find((s) => s.id === id);
        if (!c) return null;
        return { id: key, heading: c.title, items: visible(c.items).map((i) => ({ title: [i.heading, i.subheading].filter(Boolean).join(" · "), date: i.date.raw, lines: bullets(i.bullets) })) };
      }
    }
  };

  const order = [...r.layout.sectionOrder, ...r.customSections.map((c) => `custom:${c.id}`).filter((k) => !r.layout.sectionOrder.includes(k as never))];
  const sections = order
    .filter((k) => !hiddenSections.has(k as never))
    .map(build)
    .filter((s): s is DocSection => !!s && s.items.length > 0);

  const p = r.personalInfo;
  return {
    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Your name",
    contact: [p.headline, p.location, p.email, p.phone, ...p.links.map((l) => l.url.replace(/^https?:\/\//, ""))].filter(Boolean).join(" · "),
    sections,
  };
}
