# Puppeteer PDF export

**Milestone:** M9 · prd.md §10.3, §16.2.12
**Status:** testing

## Scope

- Worker renders the template's HTML string server-side, opens in headless Chromium via Puppeteer, `page.pdf({ format: 'A4', printBackground: true })`
- Upload the PDF to ImageKit as a private file via `packages/storage`; the user downloads through a 5-minute signed URL
- Cache by `(version content hash + template id)` — unchanged resume reuses stored PDF (`generated_files` table)
- Filename: `Firstname-Lastname-<JobTitle>.pdf`
- Free action, no AI involved

## Done when

- PDF matches the live preview for all 5 templates — visual regression tests (Playwright) pass (acceptance criterion 16.2.12)
- Re-exporting an unchanged version reuses the cached ImageKit file instead of re-rendering

## What was built

- **Service:** [pdf.ts](../../../packages/services/src/pdf.ts). `requestPdfExport` returns the cached PDF as a 5-minute signed URL, or enqueues a render. `getPdfExportStatus` is what the client polls. `processPdfExport` is the worker step: render → upload to `/users/<id>/pdfs/` → insert a `generated_files` row.
  - **Cache key:** version + `contentHash` (recomputed from the content) + template. A version with no saved template uses Classic, the same as the preview.
  - **Concurrent renders:** the unique index keeps one row; the losing upload is deleted from ImageKit.
  - **Filename:** `pdfFileName` sanitises `Firstname-Lastname-<JobTitle>.pdf`. The preview screen uses the same function.
- **Queue:** `pdf-export` ([queue](../../../packages/queue/src/index.ts)). The job id is version + template + hash, so repeat clicks collapse into one job. 2 attempts.
- **Worker:** [pdf.ts](../../../apps/worker/src/pdf.ts). One Chromium per process, a fresh tab per job. JS is disabled and every non-`data:` request is aborted, since resume text is user data. Calls `page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })`. Concurrency is 3.
- **tRPC:** `versions.exportPdf` (mutation) and `versions.pdfStatus` (query), both scoped to the caller.
- **UI:** the Download button on the Preview screen saves the current template choice, then exports and polls (up to 90 s). It fetches the signed URL as a blob so the file gets its proper name.

## How to test

- `packages/services`: `DATABASE_URL=… npx vitest run src/pdf.test.ts`. Covers the filename, reuse of the cached file, a re-render after an edit or template switch, job-id dedupe, the concurrent-render race, failed status, cross-user denial and versions deleted before the job runs.
- `apps/worker`: `npx vitest run`. Renders all 5 templates and checks A4 size and selectable text.
- `apps/worker`: `pnpm test:visual` (Playwright; first run `npx playwright install chromium`). Rasterises page 1 of each template's PDF and pixel-diffs it against the on-screen preview. The limit is 1% of pixels; actual results were 0.28–0.75% (anti-aliasing only).
- Manual: open a version → Preview → Download PDF. A second click on an unchanged version downloads immediately and the worker logs no new render.

## Deploy notes / follow-ups

- The worker image needs Chromium's system libraries. On Railway, set `PUPPETEER_NO_SANDBOX=1` if the container runs as root. There is no Dockerfile yet (m13).
- Stale PDFs (old hashes or templates) stay in ImageKit until the version is hard-deleted. The DB rows cascade on that delete, but the ImageKit files are not removed yet. That is a small cleanup sweep for later.
- The visual test compares against the shared template HTML, not the live Next.js page. It verifies the same component, CSS and fonts end to end, but not app-level CSS around the preview.
