# Five resume templates

**Milestone:** M8 · prd.md §10.2, §10.3
**Status:** todo

## Scope

`packages/resume-templates`: Classic (default), Modern, Minimal, Professional, Technical — all available to every user (no plan gating).

- Single-column, standard section headings, selectable text, no text-in-images, A4 fixed margins, multi-page
- Each template = a React component rendering Resume JSON → HTML + print CSS
- One renderer shared by web preview and PDF (see m9-pdf) — self-hosted fonts loaded in both so preview and PDF match
- Page breaks via CSS `break-inside: avoid` on items

## Done when

- Same Resume JSON renders pixel-equivalent in preview and PDF for all 5 templates (feeds into the visual regression task in m9-pdf)

## Implementation

- `packages/resume-templates` contains:
  - `resumeToDoc`: turns Resume JSON into the page model, following the section order and hidden sections/items.
  - Five React template components (`ClassicTemplate` … `TechnicalTemplate`).
  - `RESUME_CSS`: A4 page, 18/16 mm margins, `break-inside: avoid` on items, and the same content width on screen and in print.
  - `renderResumeHtml` (`/html`), which m9's Puppeteer step will use.
  - `inlineFontCss` (`/node`), which inlines the @fontsource woff2 files as data URIs.
- The web preview (`ResumeDocument`) renders the same component and CSS and imports the same @fontsource files. Zoom is a CSS transform, so text wraps the same way at every zoom level.
- The admin template cards now show a real render of `SAMPLE_RESUME`.

## How to test

- `pnpm --filter @resume-pilot/resume-templates test` checks, for every template:
  - real text only (no images, canvas or SVG) and standard headings
  - the A4 print rules
  - deterministic output
  - the inlined fonts
  - render time under 50 ms
- Pixel-level comparison of preview vs PDF is the m9 visual regression task.
