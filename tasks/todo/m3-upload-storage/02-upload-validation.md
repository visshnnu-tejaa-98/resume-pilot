# Upload validation

**Milestone:** M3 · prd.md §5.1, §16.2.2
**Status:** todo

## Scope

- Accept `.tex`, `.pdf`, `.docx`, `.png/.jpg/.jpeg`; max 10 MB; max 5 pages/images
- Magic-byte validation via `file-type` (not extension-based)
- Duplicate detection: SHA-256 of file per user, unique `(user_id, file_hash)` on `resumes`
- Reject low-quality OCR images (Tesseract avg word confidence < threshold, e.g. 60%) with a "clearer file" message

## Done when

- Mismatched extension/content is rejected (e.g. renamed .exe to .pdf)
- Re-uploading the same file by the same user is detected as duplicate
