import { OCR_LOW_QUALITY_MESSAGE } from "./validate";

/**
 * Extraction types and errors, kept apart from the extractors so code
 * that only needs to recognise an ExtractionError (services, web) doesn't
 * load canvas, OCR, mammoth or the LaTeX parser.
 */

/** Pluggable OCR so tests and the worker can share one engine instance. */
export interface OcrLine {
  text: string;
  /** 0–100, Tesseract's line confidence. */
  confidence: number;
}

export interface OcrEngine {
  recognize(
    image: Uint8Array,
  ): Promise<{ text: string; wordConfidences: number[]; lines?: OcrLine[] }>;
}

/**
 * A line OCR read with low confidence, kept so the JSON step can flag
 * the resume fields that came from it (prd.md §5.3 step 5).
 */
export interface LowConfidenceLine {
  /** 1-based page number in the upload. */
  page: number;
  text: string;
  confidence: number;
}

/** Lines under this confidence are kept for field flagging (below 60 is `low`, else `medium`). */
export const LINE_FLAG_THRESHOLD = 75;

export type PageMethod = "text_layer" | "ocr" | "docx" | "latex";

export interface ExtractionResult {
  text: string;
  pages: {
    method: PageMethod;
    chars: number;
    ocrConfidence?: number;
    /** OCR pages only: lines read below LINE_FLAG_THRESHOLD. */
    lowConfidenceLines?: LowConfidenceLine[];
  }[];
}

export type ExtractionFailure =
  "low_quality_image" | "no_text" | "too_long" | "unreadable" | "unsafe_archive";

const MESSAGES: Record<ExtractionFailure, string> = {
  low_quality_image: OCR_LOW_QUALITY_MESSAGE,
  no_text: "We couldn't find any text in that file. Check it's your resume and try again.",
  too_long: "That resume is longer than 5 pages. Upload a shorter version.",
  unreadable: "We couldn't read that file. Try exporting it again.",
  unsafe_archive:
    "That Word file is malformed. Re-save it from Word or Google Docs and upload again.",
};

/** A problem with the file itself: retrying won't help, the user must upload again. */
export class ExtractionError extends Error {
  constructor(readonly reason: ExtractionFailure) {
    super(MESSAGES[reason]);
    this.name = "ExtractionError";
  }
}
