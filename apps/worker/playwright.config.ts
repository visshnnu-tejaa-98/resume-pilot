import { defineConfig } from "@playwright/test";

/** PDF-vs-preview visual regression (prd.md §16.2.12). Run: pnpm --filter @resume-pilot/worker test:visual */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    browserName: "chromium",
    headless: true,
    // Same flag the PDF renderer launches Chrome with (src/pdf.ts): without it Linux
    // hints screen glyphs, changing their widths, so lines wrap differently than in print.
    launchOptions: { args: ["--font-render-hinting=none"] },
  },
});
