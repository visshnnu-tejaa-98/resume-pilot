import { writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { expect, test } from "@playwright/test";
import { PAGE, SAMPLE_RESUME, TEMPLATE_KEYS } from "@resume-pilot/resume-templates";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { buildResumeHtml, closeBrowser, renderResumePdf } from "../src/pdf";

/**
 * Acceptance 16.2.12: the downloaded PDF matches the live preview.
 *
 * - Preview: the template's HTML (same component, CSS and fonts the web
 *   preview uses) shown on screen in Playwright's Chromium.
 * - PDF: the production path — renderResumePdf (Puppeteer) — rasterised
 *   with pdf.js at the same pixel size.
 * Page 1's content box (inside the print margins) must match pixel for
 * pixel, give or take anti-aliasing.
 */

const SCALE = 2;
const PX_PER_MM = 96 / 25.4;
/** Whole CSS pixels, so the screenshot clip and the PDF raster line up exactly. */
const W_CSS = Math.floor(PAGE.widthMm * PX_PER_MM);
/** Compare down to the bottom margin: below it the PDF starts page 2 while the screen keeps flowing. */
const H_CSS = Math.floor((PAGE.heightMm - PAGE.marginYMm) * PX_PER_MM);
const W = W_CSS * SCALE;
const H = H_CSS * SCALE;
/** Share of pixels allowed to differ (glyph anti-aliasing between screen and PDF rasterisers). */
const MAX_DIFF_RATIO = 0.01;

test.afterAll(closeBrowser);

async function previewPng(page: import("@playwright/test").Page, key: string): Promise<PNG> {
  await page.setViewportSize({ width: Math.ceil(PAGE.widthMm * PX_PER_MM), height: Math.ceil(PAGE.heightMm * PX_PER_MM) });
  await page.setContent(buildResumeHtml(SAMPLE_RESUME, key), { waitUntil: "load" });
  // The web preview sits the page at its own origin; drop the UA's 8px body margin to match.
  await page.addStyleTag({ content: "body{margin:0}" });
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W_CSS, height: H_CSS }, scale: "device" });
  return PNG.sync.read(shot);
}

async function pdfPng(key: string): Promise<PNG> {
  const task = getDocument({ data: await renderResumePdf(SAMPLE_RESUME, key) });
  try {
    const doc = await task.promise;
    const p = await doc.getPage(1);
    // Same px-per-mm as the screenshot (1 pt = 96/72 CSS px).
    const viewport = p.getViewport({ scale: (96 / 72) * SCALE });
    const canvas = createCanvas(W, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
    const full = PNG.sync.read(canvas.toBuffer("image/png"));
    const out = new PNG({ width: W, height: H });
    PNG.bitblt(full, out, 0, 0, W, H, 0, 0);
    return out;
  } finally {
    await task.destroy();
  }
}

test.use({ deviceScaleFactor: SCALE });

for (const key of TEMPLATE_KEYS) {
  test(`${key}: PDF matches the preview`, async ({ page }, info) => {
    const [preview, pdf] = [await previewPng(page, key), await pdfPng(key)];
    expect(preview.width).toBe(W);
    expect(preview.height).toBe(H);

    const diff = new PNG({ width: W, height: H });
    const changed = pixelmatch(preview.data, pdf.data, diff.data, W, H, { threshold: 0.2, includeAA: false });
    const ratio = changed / (W * H);
    if (ratio > MAX_DIFF_RATIO) {
      // Written to test-results/ so a failure can be inspected.
      for (const [name, png] of [["preview", preview], ["pdf", pdf], ["diff", diff]] as const) {
        await writeFile(info.outputPath(`${name}.png`), PNG.sync.write(png));
      }
    }
    console.log(`${key}: ${(ratio * 100).toFixed(3)}% of pixels differ`);
    expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  });
}
