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
