# Visual regression (PDF vs preview)

**Milestone:** M13 · prd.md §16.2.12
**Status:** testing — passes locally; CI workflow added, first GitHub run pending

## Scope

- Playwright visual diff suite comparing each of the 5 templates' web preview vs. rendered PDF for a fixed set of sample resumes
- Run in CI on every change to `packages/resume-templates`

## Done when

- Suite catches a deliberately introduced CSS mismatch (e.g. font fallback diff) between preview and PDF

## Progress

- Suite: [apps/worker/e2e/pdf-vs-preview.spec.ts](../../../apps/worker/e2e/pdf-vs-preview.spec.ts) — run `pnpm --filter @resume-pilot/worker test:visual`.
- Preview side is built like the web preview: same template markup + `RESUME_CSS`, fonts from the exact `@fontsource` stylesheets `ResumeDocument.tsx` imports (parsed from that file). PDF side is the production `renderResumePdf` (Puppeteer, inlined fonts), rasterised with pdf.js.
- 5 templates × 2 fixed samples (the gallery sample, and a long one with unicode — ₹, ★, accents, links, a third job). Page 1 compared in 48-px bands, each aligned within ±3 px to forgive sub-pixel line rounding between screen and print.
- **Done-when:** two deliberate mismatches are tests that must be caught — the preview losing its web fonts (font fallback) and a line-height drift.
- Measured (2026-11-26): real matches 0.06–0.40% pixels differ; font fallback 1.23%; line-height 2.03%. Threshold 0.6%.
- CI: [.github/workflows/visual.yml](../../../.github/workflows/visual.yml) on any change to templates, fonts, the PDF renderer or the preview component; diff PNGs uploaded on failure.
