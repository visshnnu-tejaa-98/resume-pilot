import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FONT_FILES } from "./templates";

/**
 * Node-only: the same @fontsource CSS the web preview imports, with each
 * font file inlined as a data URI, so headless Chromium needs no network
 * and renders with byte-identical fonts.
 */
let cached: string | null = null;

export function inlineFontCss(): string {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const parts: string[] = [];
  for (const [pkg, weights] of FONT_FILES) {
    for (const w of weights) {
      const cssPath = require.resolve(`${pkg}/${w}.css`);
      const dir = dirname(cssPath);
      const css = readFileSync(cssPath, "utf8")
        // woff2 only (Chromium supports it); drop the woff fallback.
        .replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, "")
        .replace(/url\((\.\/files\/[^)]+\.woff2)\)/g, (_m, rel: string) => `url(data:font/woff2;base64,${readFileSync(join(dir, rel)).toString("base64")})`);
      parts.push(css);
    }
  }
  cached = parts.join("\n");
  return cached;
}
