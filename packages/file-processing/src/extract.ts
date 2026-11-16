import { createCanvas } from "@napi-rs/canvas";
import { latexParser } from "latex-utensils";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ExtractionError,
  LINE_FLAG_THRESHOLD,
  type ExtractionResult,
  type OcrEngine,
} from "./errors";

// Re-exported so worker code can import everything extraction-related from "./extract".
export {
  ExtractionError,
  type ExtractionFailure,
  type ExtractionResult,
  type OcrEngine,
  type PageMethod,
} from "./errors";
import { isOcrQualityAcceptable, MAX_PAGES, type ResumeFormat } from "./validate";

/**
 * Raw text extraction — prd.md §5.3 step 3. Runs in the worker.
 *
 * - PDF: text layer first (pdf.js); a page with almost no text is
 *   treated as scanned, rendered to an image and OCR'd.
 * - DOCX: mammoth, after a zip-bomb check.
 * - LaTeX: parsed (latex-utensils), never compiled: sections, list
 *   items and \href links are kept as plain text.
 * - Images: OCR, up to 5 as pages of one resume.
 *
 * Every OCR'd page must pass the confidence gate (§5.1), else the
 * upload fails with the "clearer file" message.
 */

/** Below this many non-space characters a PDF page is treated as scanned. */
export const SCANNED_PAGE_MIN_CHARS = 30;
/** Text-length stand-in for "5 pages" where pages can't be counted (TeX, DOCX without metadata). */
export const MAX_TEXT_CHARS = 40_000;
/** DOCX safety caps (zip bomb). */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 2_000;
const OCR_RENDER_SCALE = 2;

const nonSpace = (s: string) => s.replace(/\s/g, "").length;

/** Collapses runs of spaces and blank lines; trims each line. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v\u00a0]+/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ocrPage(ocr: OcrEngine, image: Uint8Array, page: number) {
  const { text, wordConfidences, lines = [] } = await ocr.recognize(image);
  if (!isOcrQualityAcceptable(wordConfidences)) throw new ExtractionError("low_quality_image");
  const avg = wordConfidences.reduce((s, c) => s + c, 0) / wordConfidences.length;
  const lowConfidenceLines = lines
    .filter((l) => l.text.trim().length >= 2 && l.confidence < LINE_FLAG_THRESHOLD)
    .map((l) => ({ page, text: l.text.trim(), confidence: Math.round(l.confidence) }));
  return { text, confidence: Math.round(avg), lowConfidenceLines };
}

// --- PDF ------------------------------------------------------------

export async function extractPdf(data: Uint8Array, ocr: OcrEngine): Promise<ExtractionResult> {
  const task = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch {
      throw new ExtractionError("unreadable");
    }
    if (doc.numPages > MAX_PAGES) throw new ExtractionError("too_long");

    const texts: string[] = [];
    const pages: ExtractionResult["pages"] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }

      if (nonSpace(text) >= SCANNED_PAGE_MIN_CHARS) {
        texts.push(text);
        pages.push({ method: "text_layer", chars: nonSpace(text) });
        continue;
      }

      // Scanned page: render it and OCR the image.
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdf.js types `canvas` as the browser's HTMLCanvasElement; in Node it
      // accepts @napi-rs/canvas (its own optional dependency for this).
      type RenderCanvas = Parameters<typeof page.render>[0]["canvas"];
      await page.render({ canvas: canvas as unknown as RenderCanvas, viewport }).promise;
      const ocrd = await ocrPage(ocr, canvas.toBuffer("image/png"), n);
      texts.push(ocrd.text);
      pages.push({
        method: "ocr",
        chars: nonSpace(ocrd.text),
        ocrConfidence: ocrd.confidence,
        lowConfidenceLines: ocrd.lowConfidenceLines,
      });
    }
    return { text: texts.join("\n\n"), pages };
  } finally {
    await task.destroy().catch(() => {});
  }
}

// --- DOCX -----------------------------------------------------------

/**
 * Reads the ZIP central directory and sums declared uncompressed sizes
 * before anything is inflated, so a zip bomb is refused up front.
 */
export function inspectZip(data: Uint8Array): { entries: number; uncompressedBytes: number } {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  // End-of-central-directory record: last 22 bytes + up to 64 KB comment.
  const minStart = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ExtractionError("unreadable");

  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let uncompressedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new ExtractionError("unreadable");
    }
    uncompressedBytes += buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, uncompressedBytes };
}

/** Word writes the page count to docProps/app.xml; null when absent. */
async function docxPageCount(data: Uint8Array): Promise<number | null> {
  const buf = Buffer.from(data);
  const name = Buffer.from("docProps/app.xml");
  const at = buf.indexOf(name);
  if (at < 0) return null;
  // Only stored (uncompressed) entries are readable this cheaply; otherwise skip.
  const header = at - 30;
  if (header < 0 || buf.readUInt32LE(header) !== 0x04034b50 || buf.readUInt16LE(header + 8) !== 0)
    return null;
  const size = buf.readUInt32LE(header + 18);
  const xml = buf.subarray(
    at + name.length + buf.readUInt16LE(header + 28),
    at + name.length + buf.readUInt16LE(header + 28) + size,
  );
  const match = /<Pages>(\d+)<\/Pages>/.exec(xml.toString("utf8"));
  return match ? Number(match[1]) : null;
}

export async function extractDocx(data: Uint8Array): Promise<ExtractionResult> {
  const { entries, uncompressedBytes } = inspectZip(data);
  if (entries > MAX_DOCX_ENTRIES || uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
    throw new ExtractionError("unsafe_archive");
  }
  const pages = await docxPageCount(data);
  if (pages !== null && pages > MAX_PAGES) throw new ExtractionError("too_long");

  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(data) }));
  } catch {
    throw new ExtractionError("unreadable");
  }
  return { text: value, pages: [{ method: "docx", chars: nonSpace(value) }] };
}

// --- LaTeX ------------------------------------------------------------

type LNode = latexParser.Node;

const SECTION_COMMANDS = new Set([
  "section",
  "subsection",
  "subsubsection",
  "chapter",
  "part",
  "cvsection",
]);
/** Commands whose arguments are formatting/config, never resume content. */
const SKIP_COMMANDS = new Set([
  "documentclass",
  "usepackage",
  "newcommand",
  "renewcommand",
  "providecommand",
  "setlength",
  "addtolength",
  "pagestyle",
  "thispagestyle",
  "geometry",
  "hypersetup",
  "definecolor",
  "titleformat",
  "titlespacing",
  "vspace",
  "hspace",
  "label",
  "input",
  "include",
  "fontsize",
  "selectfont",
  "color",
  "pagenumbering",
  "raggedright",
  "raggedleft",
  "centering",
  "newpage",
  "clearpage",
]);

/**
 * Custom macros whose definition starts a list item, e.g.
 * \newcommand{\resumeItem}[1]{\item\small{#1}} — common in resume
 * templates. They're rendered as bullets like a plain \item.
 */
function findItemMacros(source: string): Set<string> {
  const names = new Set<string>();
  const re =
    /\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?\s*(?:\[\d\])?\s*(?:\[[^\]]*\])?\s*\{([^\n]*)/g;
  for (const m of source.matchAll(re)) {
    if (/\\item\b/.test(m[2] ?? "")) names.add(m[1]!);
  }
  return names;
}

function latexToText(nodes: LNode[], itemMacros: Set<string> = new Set()): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text.string":
        out += node.content;
        break;
      case "space":
      case "softbreak":
        out += " ";
        break;
      case "linebreak":
        out += "\n";
        break;
      case "parbreak":
        out += "\n\n";
        break;
      case "command.href":
        out += `${latexToText(node.content, itemMacros)} (${node.url})`;
        break;
      case "command.url":
        out += node.url;
        break;
      case "command": {
        if (SKIP_COMMANDS.has(node.name)) break;
        const args = node.args
          .filter((a) => a.kind === "arg.group")
          .map((a) => latexToText(a.content, itemMacros).trim());
        if (SECTION_COMMANDS.has(node.name.replace(/\*$/, ""))) {
          out += `\n\n${args.join(" ")}\n`;
        } else if (node.name === "item") {
          out += "\n- ";
        } else if (itemMacros.has(node.name)) {
          out += `\n- ${args.filter(Boolean).join(" | ")}\n`;
        } else if (args.length > 1) {
          // Custom resume macros, e.g. \resumeSubheading{Company}{Dates}{Title}{Place}.
          out += `\n${args.filter(Boolean).join(" | ")}\n`;
        } else if (args.length === 1) {
          out += args[0];
        } else if (node.name === "\\" || node.name === "newline") {
          out += "\n";
        } else if (
          node.name === "&" ||
          node.name === "%" ||
          node.name === "$" ||
          node.name === "#" ||
          node.name === "_"
        ) {
          out += node.name;
        }
        break;
      }
      case "env":
        if (
          [
            "tabular",
            "tabularx",
            "itemize",
            "enumerate",
            "description",
            "center",
            "minipage",
          ].includes(node.name)
        ) {
          out += `\n${latexToText(node.content, itemMacros)}\n`;
        } else {
          out += latexToText(node.content, itemMacros);
        }
        break;
      case "arg.group":
        out += latexToText(node.content, itemMacros);
        break;
      case "alignmentTab":
        out += " | ";
        break;
      case "inlineMath":
      case "displayMath":
        // Resumes rarely use math beyond $|$ separators; keep any plain text.
        out += " ";
        break;
      default:
        break;
    }
  }
  return out;
}

export function extractLatex(data: Uint8Array): ExtractionResult {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new ExtractionError("unreadable");
  }
  let ast: latexParser.LatexAst;
  try {
    ast = latexParser.parse(source, { timeout: 5_000 });
  } catch {
    throw new ExtractionError("unreadable");
  }
  const root = ast.kind === "ast.root" ? ast.content : [];
  // Only the document body; the preamble is configuration.
  const body = root.find(
    (n): n is latexParser.Environment => n.kind === "env" && n.name === "document",
  );
  const text = latexToText(body ? body.content : root, findItemMacros(source));
  return { text, pages: [{ method: "latex", chars: nonSpace(text) }] };
}

// --- Images ----------------------------------------------------------

export async function extractImages(
  images: Uint8Array[],
  ocr: OcrEngine,
): Promise<ExtractionResult> {
  const texts: string[] = [];
  const pages: ExtractionResult["pages"] = [];
  for (const [i, image] of images.entries()) {
    const ocrd = await ocrPage(ocr, image, i + 1);
    texts.push(ocrd.text);
    pages.push({
      method: "ocr",
      chars: nonSpace(ocrd.text),
      ocrConfidence: ocrd.confidence,
      lowConfidenceLines: ocrd.lowConfidenceLines,
    });
  }
  return { text: texts.join("\n\n"), pages };
}

// --- Entry point -----------------------------------------------------

export async function extractText(
  format: ResumeFormat,
  files: Uint8Array[],
  ocr: OcrEngine,
): Promise<ExtractionResult> {
  if (files.length === 0) throw new ExtractionError("unreadable");
  let result: ExtractionResult;
  switch (format) {
    case "pdf":
      result = await extractPdf(files[0]!, ocr);
      break;
    case "docx":
      result = await extractDocx(files[0]!);
      break;
    case "tex":
      result = extractLatex(files[0]!);
      break;
    case "png":
    case "jpg":
    case "jpeg":
      result = await extractImages(files, ocr);
      break;
  }
  const text = normalizeText(result.text);
  if (nonSpace(text) < SCANNED_PAGE_MIN_CHARS) throw new ExtractionError("no_text");
  if (text.length > MAX_TEXT_CHARS) throw new ExtractionError("too_long");
  return { ...result, text };
}
