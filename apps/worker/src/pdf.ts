import { renderResumeHtml } from "@resume-pilot/resume-templates/html";
import { inlineFontCss } from "@resume-pilot/resume-templates/node";
import { toTemplateKey } from "@resume-pilot/resume-templates";
import type { Resume } from "@resume-pilot/validators/resume";
import puppeteer, { type Browser } from "puppeteer";

/**
 * PDF rendering — prd.md §10.3. The same template component and CSS as
 * the web preview, rendered to a static HTML string, printed by headless
 * Chromium. Fonts are inlined, so the page makes no network requests
 * (and is blocked from making any).
 */

let browser: Promise<Browser> | undefined;

/** One Chromium per worker process, launched on the first PDF job. */
function getBrowser(): Promise<Browser> {
  browser ??= puppeteer
    .launch({
      headless: true,
      // Containers (Railway) usually run as root with a small /dev/shm.
      args: [...(process.env.PUPPETEER_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : []), "--disable-dev-shm-usage", "--font-render-hinting=none"],
    })
    .then((b) => {
      b.on("disconnected", () => {
        browser = undefined; // crashed: relaunch on the next job
      });
      return b;
    })
    .catch((err: unknown) => {
      browser = undefined;
      throw err;
    });
  return browser;
}

export function buildResumeHtml(content: Resume, templateKey: string, title?: string): string {
  return renderResumeHtml(content, toTemplateKey(templateKey), { fontCss: inlineFontCss(), title });
}

export async function renderResumePdf(content: Resume, templateKey: string, title?: string): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    page.setDefaultTimeout(30_000);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    // Resume text is user data: nothing in it may make the renderer fetch anything.
    page.on("request", (req) => (req.url().startsWith("data:") ? req.continue() : req.abort()));
    await page.setContent(buildResumeHtml(content, templateKey, title), { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeBrowser(): Promise<void> {
  const b = await browser?.catch(() => undefined);
  browser = undefined;
  await b?.close().catch(() => undefined);
}
