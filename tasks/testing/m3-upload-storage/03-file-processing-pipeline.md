# File processing pipeline

**Milestone:** M3 · prd.md §5.3
**Status:** testing. Both "done when" items are verified, end to end through the real worker, ImageKit and Tesseract. The sample set is synthetic (see below); run it on real resumes before closing.

## Scope

`packages/file-processing`, run in `apps/worker`:

- LaTeX: parsed (sections, lists, `\href`), no compile needed
- PDF: pdfjs-dist for text layer first, fall back to Tesseract.js OCR for scanned pages
- DOCX: mammoth
- Images: Tesseract.js OCR, up to 5 images treated as pages of one resume
- Worker flow: validate → store in ImageKit → `resumes` row (`status = uploaded`) → extract raw text → any failure shows error + retry, no wallet impact

## Done when

- All 4 formats produce raw text reliably on a sample set of resumes: **done on a synthetic set**. A live run through the real pipeline (upload → ImageKit → queue → worker → real Tesseract) extracted all 9 key facts (name, both companies, title, "38%", "40,000", university, two skills) from each sample:
  - PDF with a text layer: 9/9 via the text layer
  - **Scanned** PDF (image only, no text layer): 9/9 via OCR at 95% confidence
  - DOCX: 9/9
  - LaTeX in Jake's-resume style with custom macros: 9/9
  - JPEG phone photo: 9/9 via OCR at 95%
  - A blurry, noisy PNG was **rejected** with the "clearer file" message
  - **Caveat:** these are generated, not real-world resumes (no real fonts, columns, tables or phone-camera skew). Before closing this task, run the same check on a folder of real resumes.
- Extraction failures never touch the wallet (free step): **done**. A test runs a success, a bad-file failure and a crashed-storage failure, and asserts the balance, ledger rows, holds and AI jobs are unchanged.

## What was built

- **Libraries** (pinned, all older than two weeks):
  - `latex-utensils@7.0.0`. **`node-latex-parser` from the original plan doesn't exist on npm**; CLAUDE.md and prd.md are updated.
  - `mammoth@1.13.0`, `tesseract.js@7.0.0`, and `@tesseract.js-data/eng@1.0.0`. English data is bundled, so nothing is fetched from a CDN at runtime.
  - `@napi-rs/canvas@1.1.0`, pinned via a pnpm override because pdfjs-dist's range pulled in a 4-day-old 1.1.1. `tesseract.js`'s donation postinstall is declined in `allowBuilds`.
- **`packages/file-processing`**. The index stays light (validation, error types); the heavy code is behind subpaths only the worker imports, so the web app never loads canvas or OCR:
  - `./extract`, `extractText(format, files, ocr)`:
    - **PDF:** reads the text layer per page. A page with under 30 non-space characters is rendered (2× scale, via @napi-rs/canvas) and OCR'd. More than 5 pages → `too_long`.
    - **DOCX:** the ZIP central directory is checked before inflating (≤ 2,000 entries, ≤ 50 MB uncompressed; **a zip bomb declaring 4 GB is refused** as `unsafe_archive`). More than 5 pages per `docProps/app.xml` → `too_long`.
    - **LaTeX:** AST walk of the document body only (preamble and comments dropped):
      - Sections become headings, `\item` becomes `- `, `\href{url}{text}` becomes `text (url)`, and `\url` is kept.
      - Multi-argument custom macros (e.g. `\resumeSubheading`) are joined with ` | `.
      - Macros whose `\newcommand` body contains `\item` (e.g. `\resumeItem`) become bullets.
    - **Images:** OCR per page, in order.
    - Every OCR'd page must pass the 60% average word-confidence gate (`isOcrQualityAcceptable`, M3-02).
    - Output is normalized. Under 30 characters → `no_text`; over 40,000 → `too_long` (the "5 pages" stand-in for TeX and DOCX without metadata).
    - Each failure is an `ExtractionError` with a user-facing message.
  - `./ocr`: `createTesseractOcr()`, LSTM English. It collects word confidences, ignoring punctuation-only tokens.
  - `./fixtures`: realistic samples built in code (text PDF, scanned PDF with an embedded JPEG, DOCX, LaTeX, rendered and degraded images). No binaries are committed.
- **Migration 0008**: `resumes.raw_text`, `extraction_meta` (per page: method and OCR confidence), `extraction_error`.
- **`packages/services/src/extraction.ts`**:
  - `processExtraction(db, resumeId, { readFile, extract, isFinalAttempt })`: uploaded → processing → processed, or → failed with the reason.
    - A bad file (`ExtractionError`) fails at once.
    - A transient error resets to `uploaded` and throws for retry; on the final attempt it fails with a "retry" message.
    - Files already removed by the 30-day cleanup fail with "upload again".
    - Already-processed resumes are skipped.
  - `markExtractionForRetry`: owner only, from `failed` only. `failExtraction`: used when the job can't even be queued.
- **Storage**: `readFile({ userId, storageKey })` downloads through a 60-second signed URL with the same ownership check.
- **Queue**: a `resume-extraction` queue (3 attempts, 15 s/30 s backoff). The shared `addUniqueJob` retries a *failed* job, and for extraction also *replaces a completed* one, so a user's retry after a permanent failure actually runs. There are now shared producer getters (`getExtractionQueue`, `getTransactionalEmailQueue`).
- **Worker**: an extraction worker (concurrency 2; OCR is CPU-heavy) with one lazily started Tesseract engine per process, terminated on shutdown.
- **Web**: `POST /api/uploads` enqueues extraction after creating the resume. If Redis is down, the resume is marked failed so the user gets a Retry button instead of a stuck upload. **tRPC `resumes.retryExtraction`**: owner only, from failed only, then re-enqueues. `resumes.list` now includes `extractionError`.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks. New tests:
  - file-processing: 14 extraction tests, including **real Tesseract** on the scanned PDF, images, photo and degraded image
  - services: 7 extraction tests against real Postgres
  - storage: 2; queue: 3; worker: 3; route: 1 (Redis down); tRPC: 1 (retry ownership)
- The live end-to-end run above. All 6 test files and the test user were cleaned up.

## Left for later

- **Real-resume check**: drop real resumes (PDF from Word/Docs/Canva, a scan, a phone photo, DOCX, Overleaf .tex) into a local folder and run the same pipeline. Multi-column PDF layouts may come out in a jumbled reading order; M4's JSON step should tolerate that, or column detection may be needed.
- **Railway worker image (M13-05)**: `@napi-rs/canvas` needs its linux-x64-gnu binary (pnpm installs it on Linux). Allow about 1 GB RAM for Tesseract plus two concurrent jobs.
- The JSON step (raw text → Resume JSON 2.0) is M4-02. It reads `resumes.raw_text` where status is `processed`.
