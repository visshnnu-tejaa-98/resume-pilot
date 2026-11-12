# Puppeteer PDF export

**Milestone:** M9 · prd.md §10.3, §16.2.12
**Status:** todo

## Scope

- Worker renders the template's HTML string server-side, opens in headless Chromium via Puppeteer, `page.pdf({ format: 'A4', printBackground: true })`
- Upload PDF to private S3 bucket; user downloads via presigned URL
- Cache by `(version content hash + template id)` — unchanged resume reuses stored PDF (`generated_files` table)
- Filename: `Firstname-Lastname-<JobTitle>.pdf`
- Free action, no AI involved

## Done when

- PDF matches the live preview for all 5 templates — visual regression tests (Playwright) pass (acceptance criterion 16.2.12)
- Re-exporting an unchanged version reuses the cached S3 file instead of re-rendering
