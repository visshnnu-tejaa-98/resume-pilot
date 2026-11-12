# File processing pipeline

**Milestone:** M3 · prd.md §5.3
**Status:** todo

## Scope

`packages/file-processing`, run in `apps/worker`:

- LaTeX: node-latex-parser (sections, lists, `\href`), no compile needed
- PDF: pdfjs-dist for text layer first, fall back to Tesseract.js OCR for scanned pages
- DOCX: mammoth
- Images: Tesseract.js OCR, up to 5 images treated as pages of one resume
- Worker flow: validate → store in S3 → `resumes` row (`status = uploaded`) → extract raw text → any failure shows error + retry, no wallet impact

## Done when

- All 4 formats produce raw text reliably on a sample set of real resumes
- Extraction failures never touch the wallet (free step)
