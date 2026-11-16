export {
  countPdfPages,
  isOcrQualityAcceptable,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  MIN_OCR_CONFIDENCE,
  OCR_LOW_QUALITY_MESSAGE,
  UploadValidationError,
  validateUpload,
  type ResumeFormat,
  type UploadInputFile,
  type UploadRejection,
  type ValidatedFile,
  type ValidatedUpload,
} from "./validate";
// Light: errors and types only. The extractors and OCR engine are heavy
// (canvas, Tesseract, mammoth) and live behind the "./extract" and
// "./ocr" subpaths, imported only by the worker.
export {
  ExtractionError,
  type ExtractionFailure,
  type ExtractionResult,
  type OcrEngine,
  type PageMethod,
} from "./errors";
