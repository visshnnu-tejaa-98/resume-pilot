import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Upload validation — prd.md §5.1. Pure: takes the uploaded bytes,
 * returns a validated upload or a typed rejection. No storage, no DB.
 *
 * - Formats: one .tex / .pdf / .docx, or 1–5 images (.png/.jpg/.jpeg)
 *   as pages of one resume.
 * - Max 10 MB per upload, max 5 pages/images.
 * - Content is checked by magic bytes (file-type), and must match the
 *   extension: a renamed .exe is rejected whatever it's called.
 * - SHA-256 for per-user duplicate detection.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 5;

export type ResumeFormat = "tex" | "pdf" | "docx" | "png" | "jpg" | "jpeg";
const IMAGE_FORMATS = new Set<ResumeFormat>(["png", "jpg", "jpeg"]);

export interface UploadInputFile {
  /** Original file name from the browser; only its extension is used. */
  name: string;
  data: Uint8Array;
}

export interface ValidatedFile {
  extension: ResumeFormat;
  mimeType: string;
  data: Uint8Array;
}

export interface ValidatedUpload {
  /** The resume's format; for image uploads, the first image's extension. */
  format: ResumeFormat;
  files: ValidatedFile[];
  pageCount: number;
  totalBytes: number;
  /** SHA-256 hex; for multi-image uploads, of the per-image hashes in order. */
  hash: string;
  /** Original name of the first file, for display only. */
  displayName: string;
}

export type UploadRejection =
  | "no_files"
  | "too_large"
  | "too_many_files"
  | "too_many_pages"
  | "unsupported_type"
  | "content_mismatch"
  | "mixed_types"
  | "empty_file"
  | "encrypted_pdf"
  | "unreadable";

const MESSAGES: Record<UploadRejection, string> = {
  no_files: "Choose a file to upload.",
  too_large: "Files must be 10 MB or smaller in total.",
  too_many_files: "Upload one document, or up to 5 images as pages of one resume.",
  too_many_pages: "Resumes can have at most 5 pages.",
  unsupported_type: "Upload a PDF, Word (.docx), LaTeX (.tex), PNG or JPG file.",
  content_mismatch: "That file's contents don't match its type. Upload the original file.",
  mixed_types: "Images can be combined, but documents must be uploaded on their own.",
  empty_file: "That file is empty.",
  encrypted_pdf: "That PDF is password-protected. Upload an unprotected copy.",
  unreadable: "We couldn't read that file. Try exporting it again.",
};

export class UploadValidationError extends Error {
  constructor(
    readonly reason: UploadRejection,
    readonly fileName?: string,
  ) {
    super(MESSAGES[reason]);
    this.name = "UploadValidationError";
  }
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1]!.toLowerCase() : "";
}

function isResumeFormat(ext: string): ext is ResumeFormat {
  return ["tex", "pdf", "docx", "png", "jpg", "jpeg"].includes(ext);
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * LaTeX has no magic bytes. Accept it only if it's valid UTF-8 text with
 * no NUL bytes (binaries have plenty) and looks like LaTeX.
 */
function looksLikeLatex(data: Uint8Array): boolean {
  if (data.includes(0)) return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return false;
  }
  return /\\(documentclass|begin\{document\}|section\*?\{|cventry|resumeSubheading)/.test(text);
}

/** Page count; rejects encrypted or broken PDFs. */
export async function countPdfPages(data: Uint8Array): Promise<number> {
  // pdf.js takes ownership of the buffer it's given, so pass a copy.
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    return doc.numPages;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new UploadValidationError("encrypted_pdf");
    throw new UploadValidationError("unreadable");
  } finally {
    await task.destroy().catch(() => {});
  }
}

/** Magic-byte check for one file; returns its validated type. */
async function validateFile(file: UploadInputFile): Promise<ValidatedFile> {
  if (file.data.byteLength === 0) throw new UploadValidationError("empty_file", file.name);
  const ext = extensionOf(file.name);
  if (!isResumeFormat(ext)) throw new UploadValidationError("unsupported_type", file.name);

  if (ext === "tex") {
    if (!looksLikeLatex(file.data)) throw new UploadValidationError("content_mismatch", file.name);
    return { extension: "tex", mimeType: "application/x-tex", data: file.data };
  }

  const detected = await fileTypeFromBuffer(file.data);
  // file-type reports both .jpg and .jpeg as "jpg".
  const expected = ext === "jpeg" ? "jpg" : ext;
  if (!detected || detected.ext !== expected) {
    throw new UploadValidationError("content_mismatch", file.name);
  }
  if ((ext === "png" || ext === "jpg" || ext === "jpeg") && !hasImageStructure(file.data, expected)) {
    throw new UploadValidationError("unreadable", file.name);
  }
  return { extension: ext, mimeType: detected.mime, data: file.data };
}

/**
 * Magic bytes alone pass a truncated file. Cheap structural check so it's
 * rejected here, not later in OCR: a PNG needs its IHDR header chunk; a JPEG
 * needs at least one marker segment after the start-of-image marker.
 */
function hasImageStructure(data: Uint8Array, kind: string): boolean {
  if (kind === "png") return data.byteLength >= 33 && String.fromCharCode(...data.subarray(12, 16)) === "IHDR";
  return data.byteLength >= 6 && data[3] !== undefined && data[3] >= 0xc0;
}

/** Display-only name: last path segment, no control characters, capped. */
function cleanDisplayName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return (name.split(/[/\\]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
}

export async function validateUpload(input: readonly UploadInputFile[]): Promise<ValidatedUpload> {
  if (input.length === 0) throw new UploadValidationError("no_files");
  if (input.length > MAX_PAGES) throw new UploadValidationError("too_many_files");

  const totalBytes = input.reduce((sum, f) => sum + f.data.byteLength, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) throw new UploadValidationError("too_large");

  const files: ValidatedFile[] = [];
  for (const file of input) files.push(await validateFile(file));

  const allImages = files.every((f) => IMAGE_FORMATS.has(f.extension));
  if (files.length > 1 && !allImages) throw new UploadValidationError("mixed_types");

  let pageCount = files.length;
  const first = files[0]!;
  if (first.extension === "pdf") {
    pageCount = await countPdfPages(first.data);
    if (pageCount > MAX_PAGES) throw new UploadValidationError("too_many_pages");
    if (pageCount === 0) throw new UploadValidationError("unreadable");
  }
  // .docx / .tex page counts aren't knowable before rendering; extraction
  // (M3-03) enforces the 5-page limit on their content instead.

  const hash =
    files.length === 1
      ? sha256(first.data)
      : sha256(Buffer.from(files.map((f) => sha256(f.data)).join("")));

  return {
    format: first.extension,
    files,
    pageCount,
    totalBytes,
    hash,
    displayName: (/^\.[a-z]+$/i.test(cleanDisplayName(input[0]!.name)) ? "" : cleanDisplayName(input[0]!.name)) || `resume.${first.extension}`,
  };
}

/**
 * OCR quality gate (prd.md §5.1): reject when Tesseract's average word
 * confidence is below the threshold. Takes the per-word confidences
 * (0–100) that OCR produced; wired into OCR in M3-03.
 */
export const MIN_OCR_CONFIDENCE = 60;

export function isOcrQualityAcceptable(
  wordConfidences: readonly number[],
  threshold = MIN_OCR_CONFIDENCE,
): boolean {
  if (wordConfidences.length === 0) return false;
  const avg = wordConfidences.reduce((s, c) => s + c, 0) / wordConfidences.length;
  return avg >= threshold;
}

export const OCR_LOW_QUALITY_MESSAGE =
  "That image is too blurry or low-contrast to read. Upload a clearer photo or scan.";
