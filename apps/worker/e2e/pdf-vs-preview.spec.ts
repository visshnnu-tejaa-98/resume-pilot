import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { expect, test, type Page } from "@playwright/test";
import { PAGE, SAMPLE_RESUME, TEMPLATE_KEYS, type TemplateKey } from "@resume-pilot/resume-templates";
import { renderResumeHtml } from "@resume-pilot/resume-templates/html";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { closeBrowser, renderResumePdf } from "../src/pdf";

/**
 * Acceptance 16.2.12: the downloaded PDF matches the live preview.
 *
 * - Preview: built the way the web app builds it — the same template
 *   component and RESUME_CSS, with fonts loaded from the very @fontsource
 *   stylesheets `ResumeDocument.tsx` imports (read from that file, so this
 *   can't drift from the app). Screenshotted in Playwright's Chromium.
 * - PDF: the production path — renderResumePdf (Puppeteer, inlined fonts) —
 *   rasterised with pdf.js at the same pixel size.
 * Page 1's content box must match, give or take anti-aliasing. A final test
 * breaks the preview's fonts on purpose and checks the suite notices.
 */

const SCALE = 2;
const PX_PER_MM = 96 / 25.4;
const W_CSS = Math.floor(PAGE.widthMm * PX_PER_MM);
/** Down to the bottom margin: below it the PDF starts page 2 while the screen keeps flowing. */
const H_CSS = Math.floor((PAGE.heightMm - PAGE.marginYMm) * PX_PER_MM);
const W = W_CSS * SCALE;
const H = H_CSS * SCALE;
/** Share of pixels allowed to differ (glyph anti-aliasing between screen and PDF rasterisers). */
// Measured 2026-11-26 (after band alignment): real preview-vs-PDF 0.06–0.40%; a dropped web font 1.23%;
// a line-height drift 2.03%. 0.6% sits between with ~1.5× / 2× margin.
const MAX_DIFF_RATIO = 0.006;

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

async function previewPng(page: Page, resume: Resume, key: string, extraCss = ""): Promise<PNG> {
  // Same markup + RESUME_CSS, but no inlined fonts: the web's @fontsource stylesheets instead.
  const links = WEB_FONT_CSS.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  const html = renderResumeHtml(resume, key as TemplateKey).replace("<head>", `<head>${links}`).replace("</head>", `<style>body{margin:0}${extraCss}</style></head>`);
  const file = join(tmp, `${key}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  await page.setViewportSize({ width: Math.ceil(PAGE.widthMm * PX_PER_MM), height: Math.ceil(PAGE.heightMm * PX_PER_MM) });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    // Font faces load lazily; touch every face the CSS declares, then wait.
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined)));
    await document.fonts.ready;
  });
  return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: W_CSS, height: H_CSS }, scale: "device" }));
}

const pdfCache = new Map<string, PNG>();
async function pdfPng(resume: Resume, key: string, cacheKey: string): Promise<PNG> {
  const hit = pdfCache.get(cacheKey);
  if (hit) return hit;
  const task = getDocument({ data: await renderResumePdf(resume, key) });
  try {
    const doc = await task.promise;
    const p = await doc.getPage(1);
    const viewport = p.getViewport({ scale: (96 / 72) * SCALE });
    const canvas = createCanvas(W, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
    const full = PNG.sync.read(canvas.toBuffer("image/png"));
    const out = new PNG({ width: W, height: H });
    PNG.bitblt(full, out, 0, 0, W, H, 0, 0);
    pdfCache.set(cacheKey, out);
    return out;
  } finally {
    await task.destroy();
  }
}

/** Rows per band, and how far (device px) a band may shift to line up. */
const BAND = 48;
const MAX_SHIFT = 3 * SCALE;

/**
 * Screen layout and Chrome's print engine round fractional line positions
 * differently, so on a long page lines drift by a pixel or two. Each
 * horizontal band is compared at its best vertical offset within ±MAX_SHIFT:
 * that sub-pixel drift is forgiven, while a font fallback (different glyphs
 * and widths) or a spacing change (lines move by more than a few px) is not.
 */
function bandedDiff(a: PNG, b: PNG, out: PNG): number {
  let changed = 0;
  const rowBytes = W * 4;
  for (let y0 = 0; y0 < H; y0 += BAND) {
    const h = Math.min(BAND, H - y0);
    const slice = (img: PNG, y: number) => {
      const yy = Math.max(0, Math.min(H - h, y));
      return img.data.subarray(yy * rowBytes, (yy + h) * rowBytes);
    };
    let best = Infinity;
    let bestShift = 0;
    for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++) {
      const n = pixelmatch(slice(a, y0), slice(b, y0 + dy), null, W, h, { threshold: 0.2, includeAA: false });
      if (n < best) [best, bestShift] = [n, dy];
      if (n === 0) break;
    }
    const outSlice = Buffer.alloc(h * rowBytes);
    pixelmatch(slice(a, y0), slice(b, y0 + bestShift), outSlice, W, h, { threshold: 0.2, includeAA: false });
    outSlice.copy(out.data, y0 * rowBytes);
    changed += best;
  }
  return changed;
}

async function diffRatio(preview: PNG, pdf: PNG, save?: (name: string, png: PNG) => Promise<void>): Promise<number> {
  expect(preview.width).toBe(W);
  expect(preview.height).toBe(H);
  const diff = new PNG({ width: W, height: H });
  const ratio = bandedDiff(preview, pdf, diff) / (W * H);
  if (save && ratio > MAX_DIFF_RATIO) for (const [n, png] of [["preview", preview], ["pdf", pdf], ["diff", diff]] as const) await save(n, png);
  return ratio;
}

test.use({ deviceScaleFactor: SCALE });

test("the web preview's font stylesheets were found", () => {
  expect(WEB_FONT_CSS.length).toBeGreaterThanOrEqual(4);
});

for (const [sampleName, resume] of SAMPLES) {
  for (const key of TEMPLATE_KEYS) {
    test(`${key} / ${sampleName}: PDF matches the preview`, async ({ page }, info) => {
      const ratio = await diffRatio(await previewPng(page, resume, key), await pdfPng(resume, key, `${key}/${sampleName}`), (n, png) => writeFile(info.outputPath(`${n}.png`), PNG.sync.write(png)));
      console.log(`${key} / ${sampleName}: ${(ratio * 100).toFixed(3)}% of pixels differ`);
      expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }
}

// Done-when: the suite catches a deliberately introduced mismatch between preview and PDF.
test("catches a font-fallback mismatch (preview loses its web fonts)", async ({ page }) => {
  // e.g. an @fontsource import dropped from ResumeDocument.tsx: the browser falls back to a system font.
  const broken = "*{font-family:Georgia,'Times New Roman',serif !important}";
  const ratio = await diffRatio(await previewPng(page, SAMPLE_RESUME, "modern", broken), await pdfPng(SAMPLE_RESUME, "modern", "modern/sample"));
  console.log(`font fallback: ${(ratio * 100).toFixed(3)}% of pixels differ`);
  expect(ratio).toBeGreaterThan(MAX_DIFF_RATIO);
});

test("catches a spacing mismatch (preview line-height drifts)", async ({ page }) => {
  const ratio = await diffRatio(await previewPng(page, SAMPLE_RESUME, "classic", ".rp-resume{line-height:1.6 !important}"), await pdfPng(SAMPLE_RESUME, "classic", "classic/sample"));
  console.log(`line-height drift: ${(ratio * 100).toFixed(3)}% of pixels differ`);
  expect(ratio).toBeGreaterThan(MAX_DIFF_RATIO);
});
