import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PAGE, SAMPLE_RESUME, TEMPLATE_KEYS, type TemplateKey } from "@resume-pilot/resume-templates";
import { renderResumeHtml } from "@resume-pilot/resume-templates/html";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { closeBrowser, renderResumePdf } from "../src/pdf";

/**
 * Acceptance 16.2.12: the downloaded PDF matches the live preview.
 *
 * - Preview: built the way the web app builds it — the same template
 *   markup and RESUME_CSS, with fonts loaded from the very @fontsource
 *   stylesheets `ResumeDocument.tsx` imports (read from that file, so this
 *   can't drift from the app), laid out in Playwright's Chromium.
 * - PDF: the production path — renderResumePdf (Puppeteer, inlined fonts) —
 *   read back with pdf.js.
 *
 * What's compared is LAYOUT, not pixels: every text line on PDF page 1 must
 * exist in the preview with the same words, start and end at the same x, and
 * sit at the same height (relative to the first line). Pixel diffs depend on
 * each OS's glyph rasteriser (Linux hints screen text, pdf.js doesn't), so on
 * CI they couldn't tell a real mismatch from anti-aliasing; layout can. A font
 * fallback changes widths and line breaks; a spacing change moves lines —
 * both are deliberately introduced below and must be caught.
 */

const PX_PER_MM = 96 / 25.4;
const PT_TO_PX = 96 / 72;
/** Allowed horizontal difference per line edge, and vertical drift (CSS px). */
const MAX_DX = 2;
const MAX_DY = 4;

const ROOT = join(import.meta.dirname, "../../..");
const templatesRequire = createRequire(join(ROOT, "packages/resume-templates/package.json"));

/** The @fontsource stylesheets the web preview imports, as file:// URLs. */
const WEB_FONT_CSS: string[] = [...readFileSync(join(ROOT, "apps/web/src/components/resume/ResumeDocument.tsx"), "utf8").matchAll(/import\s+["'](@fontsource\/[^"']+\.css)["']/g)].map(
  (m) => pathToFileURL(templatesRequire.resolve(m[1]!)).href,
);

/** A second, longer sample: unicode, many sections, links, a page break. */
const LONG_RESUME: Resume = resumeSchema.parse({
  ...SAMPLE_RESUME,
  personalInfo: { ...SAMPLE_RESUME.personalInfo, firstName: "Zoë", lastName: "Fernández-Iyer", location: "Bommanahalli, Bengaluru, Karnataka", links: [{ id: "l_1", type: "linkedin", url: "linkedin.com/in/zoe-fi" }, { id: "l_2", type: "github", url: "github.com/zoe-fi" }] },
  summary: { text: "Product-minded engineer (₹ payments, fintech) shipping résumé tooling. Built accessible UIs used by 1,200+ teams across APAC — naïve-user friendly, WCAG 2.1 AA.\n\nLed migrations from REST to GraphQL and owned on-call for the payments platform." },
  workExperience: [
    ...SAMPLE_RESUME.workExperience,
    { id: "we_3", company: "Initech Pvt. Ltd.", designation: "Software Engineer", location: "Hyderabad", startDate: { value: "2019-06", raw: "Jun 2019" }, endDate: { value: "2020-12", raw: "Dec 2020" }, bullets: Array.from({ length: 6 }, (_, i) => ({ id: `b_${10 + i}`, text: `Delivered feature ${i + 1}: a long bullet that wraps onto a second line to exercise line height, kerning and the page-break rules in both renderers.` })) },
  ],
  projects: [{ id: "pr_1", name: "Open-source date picker", url: "github.com/zoe-fi/picker", technologies: ["React", "TypeScript"], bullets: [{ id: "b_30", text: "Keyboard-accessible date picker — 2k★ on GitHub." }] }],
});

const SAMPLES: [string, Resume][] = [
  ["sample", SAMPLE_RESUME],
  ["long-unicode", LONG_RESUME],
];

let tmp: string;
test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "rp-visual-"));
});
test.afterAll(async () => {
  rmSync(tmp, { recursive: true, force: true });
  await closeBrowser();
});

interface Line {
  /** Letters and digits only, lower-cased: punctuation, bullets and separators differ between DOM text and PDF text. */
  key: string;
  left: number;
  right: number;
  /** Vertical centre of the line's glyphs (CSS px from the page top). */
  mid: number;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function groupLines(words: { text: string; left: number; right: number; mid: number }[], tol: number): Line[] {
  const sorted = [...words].sort((a, b) => a.mid - b.mid || a.left - b.left);
  const lines: (typeof words)[] = [];
  for (const w of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last[0]!.mid - w.mid) <= tol) last.push(w);
    else lines.push([w]);
  }
  return lines
    .map((ws) => ws.sort((a, b) => a.left - b.left))
    .map((ws) => ({ key: norm(ws.map((w) => w.text).join("")), left: Math.min(...ws.map((w) => w.left)), right: Math.max(...ws.map((w) => w.right)), mid: ws.reduce((n, w) => n + w.mid, 0) / ws.length }))
    .filter((l) => l.key.length > 0);
}

async function previewLines(page: Page, resume: Resume, key: string, extraCss = ""): Promise<Line[]> {
  // Same markup + RESUME_CSS, but no inlined fonts: the web's @fontsource stylesheets instead.
  const links = WEB_FONT_CSS.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  const html = renderResumeHtml(resume, key as TemplateKey).replace("<head>", `<head>${links}`).replace("</head>", `<style>body{margin:0}${extraCss}</style></head>`);
  const file = join(tmp, `${key}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  await page.setViewportSize({ width: Math.ceil(PAGE.widthMm * PX_PER_MM), height: Math.ceil(PAGE.heightMm * PX_PER_MM) });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  const words = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined)));
    await document.fonts.ready;
    const out: { text: string; left: number; right: number; mid: number }[] = [];
    const walker = document.createTreeWalker(document.querySelector(".rp-resume")!, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      // Split at hyphens too: "page-break" may wrap after "page-", so each part is its own token.
      for (const m of text.matchAll(/[^\s-]+-?|-/g)) {
        range.setStart(n, m.index!);
        range.setEnd(n, m.index! + m[0].length);
        const r = range.getBoundingClientRect();
        if (r.width > 0) out.push({ text: m[0], left: r.left, right: r.right, mid: (r.top + r.bottom) / 2 });
      }
    }
    return out;
  });
  return groupLines(words, 3);
}

const pdfCache = new Map<string, Line[]>();
async function pdfLines(resume: Resume, key: string, cacheKey: string): Promise<Line[]> {
  const hit = pdfCache.get(cacheKey);
  if (hit) return hit;
  const task = getDocument({ data: await renderResumePdf(resume, key) });
  try {
    const doc = await task.promise;
    const p = await doc.getPage(1);
    const pageH = p.getViewport({ scale: 1 }).height;
    const content = await p.getTextContent();
    const words = content.items.flatMap((it) => {
      if (!("str" in it) || !norm(it.str)) return [];
      const [, , , d, x, y] = it.transform as number[];
      const size = Math.abs(d!);
      // pdf.js gives the baseline; the glyph-box centre sits ~0.3 em above it (as the DOM rect's centre does).
      return [{ text: it.str, left: x! * PT_TO_PX, right: (x! + it.width) * PT_TO_PX, mid: (pageH - y! - size * 0.3) * PT_TO_PX }];
    });
    const lines = groupLines(words, 2);
    pdfCache.set(cacheKey, lines);
    return lines;
  } finally {
    await task.destroy();
  }
}

interface Comparison {
  pdfLines: number;
  /** PDF page-1 lines with no preview line of the same text, in order (a different wrap or missing text). */
  unmatched: string[];
  maxDx: number;
  maxDy: number;
}

/** Walks PDF page-1 lines in order and finds each in the preview's lines, in order. */
function compare(preview: Line[], pdf: Line[]): Comparison {
  const unmatched: string[] = [];
  let maxDx = 0;
  let maxDy = 0;
  let from = 0;
  let anchor: { p: number; q: number } | null = null;
  for (const q of pdf) {
    const i = preview.findIndex((l, idx) => idx >= from && l.key === q.key);
    if (i < 0) {
      unmatched.push(q.key.slice(0, 40));
      continue;
    }
    const p = preview[i]!;
    from = i + 1;
    anchor ??= { p: p.mid, q: q.mid };
    maxDx = Math.max(maxDx, Math.abs(p.left - q.left), Math.abs(p.right - q.right));
    maxDy = Math.max(maxDy, Math.abs(p.mid - anchor.p - (q.mid - anchor.q)));
  }
  return { pdfLines: pdf.length, unmatched, maxDx, maxDy };
}

const matches = (c: Comparison) => c.unmatched.length === 0 && c.maxDx <= MAX_DX && c.maxDy <= MAX_DY;
const fmt = (c: Comparison) => `${c.pdfLines} lines, ${c.unmatched.length} unmatched, max Δx ${c.maxDx.toFixed(2)}px, max Δy ${c.maxDy.toFixed(2)}px`;

test("the web preview's font stylesheets were found", () => {
  expect(WEB_FONT_CSS.length).toBeGreaterThanOrEqual(4);
});

for (const [sampleName, resume] of SAMPLES) {
  for (const key of TEMPLATE_KEYS) {
    test(`${key} / ${sampleName}: PDF matches the preview`, async ({ page }) => {
      const c = compare(await previewLines(page, resume, key), await pdfLines(resume, key, `${key}/${sampleName}`));
      console.log(`${key} / ${sampleName}: ${fmt(c)}`);
      expect(c.pdfLines).toBeGreaterThan(8);
      if (c.unmatched.length) console.log("unmatched:", c.unmatched.join(" | "));
      expect(c.unmatched).toEqual([]);
      expect(c.maxDx).toBeLessThanOrEqual(MAX_DX);
      expect(c.maxDy).toBeLessThanOrEqual(MAX_DY);
    });
  }
}

// Done-when: the suite catches a deliberately introduced mismatch between preview and PDF.
test("catches a font-fallback mismatch (preview loses its web fonts)", async ({ page }) => {
  // e.g. an @fontsource import dropped from ResumeDocument.tsx: the browser falls back to a system font.
  const c = compare(await previewLines(page, SAMPLE_RESUME, "modern", "*{font-family:Georgia,'Times New Roman',serif !important}"), await pdfLines(SAMPLE_RESUME, "modern", "modern/sample"));
  console.log(`font fallback: ${fmt(c)}`);
  expect(matches(c)).toBe(false);
});

test("catches a spacing mismatch (preview line-height drifts)", async ({ page }) => {
  const c = compare(await previewLines(page, SAMPLE_RESUME, "classic", ".rp-resume{line-height:1.6 !important}"), await pdfLines(SAMPLE_RESUME, "classic", "classic/sample"));
  console.log(`line-height drift: ${fmt(c)}`);
  expect(matches(c)).toBe(false);
});

test("catches a small font-size change (preview body text 0.5pt larger)", async ({ page }) => {
  const c = compare(await previewLines(page, SAMPLE_RESUME, "minimal", ".rp-resume{font-size:10pt !important}"), await pdfLines(SAMPLE_RESUME, "minimal", "minimal/sample"));
  console.log(`font size: ${fmt(c)}`);
  expect(matches(c)).toBe(false);
});
