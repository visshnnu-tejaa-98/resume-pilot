import { SAMPLE_RESUME, TEMPLATE_KEYS } from "@resume-pilot/resume-templates";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, describe, expect, it } from "vitest";
import { buildResumeHtml, closeBrowser, renderResumePdf } from "./pdf";

/** A4 in points; Chromium rounds the page to whole device pixels, so allow 1 pt. */
const A4_PT = { w: 595.28, h: 841.89 };

describe("Puppeteer PDF render (prd.md §10.3)", () => {
  afterAll(closeBrowser);

  it("inlines fonts so the page needs no network", () => {
    const html = buildResumeHtml(SAMPLE_RESUME, "modern");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toMatch(/url\((?!data:)/);
  });

  it.each(TEMPLATE_KEYS)("renders %s as an A4 PDF with selectable text", async (key) => {
    const task = getDocument({ data: await renderResumePdf(SAMPLE_RESUME, key, "Sample") });
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const [, , w, h] = page.view;
    expect(Math.abs(w! - A4_PT.w)).toBeLessThan(1);
    expect(Math.abs(h! - A4_PT.h)).toBeLessThan(1);
    const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
    expect(text).toContain(SAMPLE_RESUME.personalInfo.lastName);
    await task.destroy();
  }, 60_000);
});
