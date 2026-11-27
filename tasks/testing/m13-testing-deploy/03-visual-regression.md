# Visual regression (PDF vs preview)

**Milestone:** M13 · prd.md §16.2.12
**Status:** testing — passes locally; CI workflow added, first GitHub run pending

## Scope

- Playwright visual diff suite comparing each of the 5 templates' web preview vs. rendered PDF for a fixed set of sample resumes
- Run in CI on every change to `packages/resume-templates`

## Done when

- Suite catches a deliberately introduced CSS mismatch (e.g. font fallback diff) between preview and PDF

## Progress

- Suite: [apps/worker/e2e/pdf-vs-preview.spec.ts](../../../apps/worker/e2e/pdf-vs-preview.spec.ts) — `pnpm --filter @resume-pilot/worker test:visual`.
- Preview side is built like the web preview: same template markup + `RESUME_CSS`, fonts from the exact `@fontsource` stylesheets `ResumeDocument.tsx` imports (parsed from that file). PDF side is the production `renderResumePdf` (Puppeteer), read back with pdf.js.
- **Compares layout, not pixels**: every text line on PDF page 1 must exist in the preview with the same words, the same left/right edges (±2 px) and the same height relative to the first line (±4 px). The first version diffed pixels; it passed on macOS but failed on GitHub's Linux runner, where screen glyph hinting made genuine matches (0.9–3.3%) look worse than deliberate breakages (~2.1%). Layout is rasteriser-independent.
- The preview browser launches with `--font-render-hinting=none`, the same flag the PDF renderer uses — without it Linux screen text has different glyph widths and lines wrap differently from print.
- 5 templates × 2 fixed samples (gallery sample; a long one with ₹, ★, accents, links, hyphenated wraps).
- **Done-when:** three deliberate mismatches must be caught — web fonts lost (font fallback), line-height drift, body text 0.5 pt larger.
- Measured 2026-11-27, identical on macOS and Linux (Playwright's Ubuntu image, as CI): real matches max Δx 1.8 px, Δy 1.8 px, 0 unmatched lines. Font fallback Δx 46–89 px + re-wrapped lines; line-height Δy 44 px; font size Δx 28 px.
- CI: [.github/workflows/visual.yml](../../../.github/workflows/visual.yml) on changes to templates, fonts, the PDF renderer or the preview component.
