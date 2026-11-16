# Upload validation

**Milestone:** M3 · prd.md §5.1, §16.2.2
**Status:** testing. Both "done when" items are verified, including a live upload through real ImageKit. The OCR confidence gate is written and tested, but plugs into OCR in M3-03. The upload UI is M4/M12.

## Scope

- Accept `.tex`, `.pdf`, `.docx`, `.png/.jpg/.jpeg`; max 10 MB; max 5 pages/images
- Magic-byte validation via `file-type` (not extension-based)
- Duplicate detection: SHA-256 of file per user, unique `(user_id, file_hash)` on `resumes`
- Reject low-quality OCR images (Tesseract avg word confidence < threshold, e.g. 60%) with a "clearer file" message

## Done when

- Mismatched extension/content is rejected (e.g. a renamed .exe as .pdf): **done**.
  - A Windows executable renamed to `.pdf`, `.png`, `.docx` or `.tex` is rejected (`content_mismatch`).
  - So are a PDF renamed to `.docx`, a PNG renamed to `.pdf`, a plain zip renamed to `.docx`, and non-LaTeX text renamed to `.tex`.
  - Through the route this returns 400 and nothing is stored.
- Re-uploading the same file by the same user is detected as a duplicate: **done**. The hash ignores the file name, and the route returns 409 with the existing resume's id. Concurrent identical uploads produce one resume, and the loser's stored file is deleted. The same file from a different user is allowed. Verified live against ImageKit.

## What was built

- **`packages/file-processing/src/validate.ts`** (`file-type@22.2.0`, `pdfjs-dist@6.4.299`, both pinned):
  - `validateUpload(files)`:
    - One `.pdf`/`.docx`/`.tex`, or 1–5 images (png/jpg/jpeg can be mixed). Documents can't be combined with anything.
    - 10 MB total.
    - Magic bytes must match the extension. LaTeX has no magic bytes, so it must be NUL-free UTF-8 that looks like LaTeX.
    - PDFs: page count via pdf.js, max 5. Encrypted PDFs are rejected with their own message, and corrupt ones (magic bytes only) as `unreadable`.
    - The SHA-256 hash covers the bytes, not the name. For multi-image uploads it's computed from the per-image hashes in order.
  - Each rejection is an `UploadValidationError` with a reason and a user-facing message.
  - `isOcrQualityAcceptable(confidences, 60)` and `OCR_LOW_QUALITY_MESSAGE`: the §5.1 gate. **M3-03 must call this after OCR** and fail the upload with that message.
  - `fixtures.ts` (export `@resume-pilot/file-processing/fixtures`): builds a real multi-page PDF, PNG, JPEG, DOCX, ZIP and EXE header in memory for tests. No binary fixtures are committed.
- **Migration 0007**: `resume_files` (`resume_id`, `page_index`, `storage_key`, `storage_file_id`, `mime_type`, `size_bytes`), one row per stored file, so multi-image uploads fit. `resumes.storage_file_id` was dropped; it was never used and `resume_files` replaces it. The 30-day cleanup now walks `resume_files`.
- **`packages/services/src/uploads.ts`**:
  - `createResumeFromUpload(db, storage, { userId, upload })`:
    1. Checks for a duplicate by hash and the daily limit of 20 uploads (prd.md §15) before storing anything.
    2. Stores each file.
    3. Inserts `resumes` (status `uploaded`) and `resume_files` in one transaction.
    - If anything fails after storing, the stored files are deleted, so there are no orphans. A unique-index race becomes `UploadError("duplicate")`.
    - Storage is injected, so services doesn't depend on ImageKit.
  - `listResumes(db, userId)` and `getResumeFileKeys(db, { userId, resumeId })` return the user's own resumes only; `getResumeFileKeys` returns null for anyone else's resume.
- **`POST /api/uploads`** (`apps/web/app/api/uploads/route.ts`): a multipart `files` field.
  - Returns 401 when not signed in and 403 when the account is suspended.
  - Returns 413 from `content-length` before the body is read, 400 for validation failures (with `reason` and the message), 409 for duplicates (with `existingResumeId`), 429 when the daily limit is hit, and 201 with `{ resumeId, format, pageCount }` on success.
  - `pdfjs-dist` is in `serverExternalPackages` so Next doesn't bundle it.
- **tRPC** `resumes.list` and `resumes.fileUrls({ resumeId })`: 5-minute signed URLs. Anyone else's resume returns NOT_FOUND, so ids can't be probed. The storage wrapper checks ownership a second time.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks, including the Next production build. New tests: 20 validation, 10 upload/cleanup (real Postgres), 7 route, 2 tRPC.
- Live: a real PDF went validate → ImageKit → `resumes`/`resume_files` → signed URL fetch (200, bytes identical) → re-upload rejected as a duplicate. Cleaned up afterwards.

## Left for later

- **OCR quality gate in the pipeline**: M3-03 calls `isOcrQualityAcceptable` after Tesseract.
- **Page limit for .docx/.tex**: their page count isn't known before rendering, so extraction (M3-03) enforces 5 pages on the content. **Also guard against zip bombs** when unpacking `.docx` (cap the uncompressed size).
- The request body is fully buffered by `formData()` after the `content-length` check. A client that lies about `content-length` could send more; put a body-size limit at the proxy (Railway) or stream-parse if that matters.
- Enqueueing the extraction job after upload: M3-03.
