import { RESUMES } from "@resume-pilot/ai/fixtures";
import { describe, expect, it } from "vitest";
import { resumeToDoc } from "./doc";
import { renderResumeHtml } from "./html";
import { inlineFontCss } from "./node";
import { TEMPLATE_KEYS, toTemplateKey } from "./templates";

const resume = RESUMES.frontend!;

describe("resumeToDoc", () => {
  it("follows layout.sectionOrder and skips hidden sections/items", () => {
    const r = structuredClone(resume);
    r.layout.sectionOrder = ["skills", "summary", "workExperience", "projects", "education", "certifications"];
    r.layout.hiddenSections = ["projects"];
    const firstBullet = r.workExperience[0]!.bullets[0]!;
    r.layout.hiddenItems.push(firstBullet.id);
    const doc = resumeToDoc(r);
    expect(doc.sections.map((s) => s.key).slice(0, 2)).toEqual(["skills", "summary"]);
    expect(doc.sections.some((s) => s.key === "projects")).toBe(false);
    expect(JSON.stringify(doc)).not.toContain(firstBullet.text);
  });
});

describe("renderResumeHtml", () => {
  it.each(TEMPLATE_KEYS)("%s: real text, standard headings, A4 print CSS, page-break rules", (k) => {
    const html = renderResumeHtml(resume, k);
    expect(html).toContain(`rp-t-${k}`);
    expect(html).toContain(resume.workExperience[0]!.bullets[0]!.text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(html).toMatch(/<h2 class="rp-h">(Experience|Skills|Summary)<\/h2>/);
    expect(html).toContain("size:A4");
    expect(html).toContain("break-inside:avoid");
    expect(html).not.toMatch(/<img|<canvas|<svg/);
  });

  it("is deterministic for the same input", () => {
    expect(renderResumeHtml(resume, "modern")).toBe(renderResumeHtml(structuredClone(resume), "modern"));
  });

  it("inlines the self-hosted fonts for the PDF", () => {
    const css = inlineFontCss();
    for (const fam of ["Inter", "Source Serif 4", "Space Grotesk", "JetBrains Mono"]) expect(css).toContain(`font-family: '${fam}'`);
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain("./files/");
  });

  it("maps names and unknown values to a key", () => {
    expect(toTemplateKey("Modern")).toBe("modern");
    expect(toTemplateKey("nope")).toBe("classic");
  });
});

describe("performance", () => {
  it("DONE WHEN (§15): a re-render is well under the 200ms preview budget", () => {
    renderResumeHtml(resume, "classic"); // warm up
    const t = performance.now();
    for (const k of TEMPLATE_KEYS) renderResumeHtml(resume, k);
    expect((performance.now() - t) / TEMPLATE_KEYS.length).toBeLessThan(50);
  });
});

import { toLink } from "./doc";
describe("toLink", () => {
  it("adds https to bare domains and strips the scheme from the label", () => {
    expect(toLink("github.com/jane/")).toEqual({ href: "https://github.com/jane/", label: "github.com/jane" });
    expect(toLink("https://www.linkedin.com/in/jane")).toEqual({ href: "https://www.linkedin.com/in/jane", label: "linkedin.com/in/jane" });
  });
  it("refuses non-web schemes and plain text", () => {
    expect(toLink("javascript:alert(1)")).toBeUndefined();
    expect(toLink("not a link")).toBeUndefined();
    expect(toLink("")).toBeUndefined();
  });
});
