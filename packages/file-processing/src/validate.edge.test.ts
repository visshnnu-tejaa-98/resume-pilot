import { describe, expect, it } from "vitest";
import { makeDocx, makeJpg, makePdf, makePng, makeZip, SAMPLE_TEX } from "./fixtures";
import { isOcrQualityAcceptable, MAX_UPLOAD_BYTES, MIN_OCR_CONFIDENCE, UploadValidationError, validateUpload, type UploadRejection } from "./validate";

/** Edge cases for upload validation (prd.md §5.1) beyond validate.test.ts. */

const reasonOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof UploadValidationError ? e.reason : `unexpected: ${String(e)}`),
  );
const expectReason = (files: Parameters<typeof validateUpload>[0], reason: UploadRejection | "ok") => expect(reasonOf(validateUpload(files))).resolves.toBe(reason);
const padded = (data: Uint8Array, total: number) => {
  const out = new Uint8Array(total);
  out.set(data);
  return out;
};

describe("file names", () => {
  it("extensions are case-insensitive (.PDF, .DOCX, .TEX, .PNG, .JPEG)", async () => {
    await expectReason([{ name: "CV.PDF", data: makePdf(1) }], "ok");
    await expectReason([{ name: "CV.DOCX", data: makeDocx() }], "ok");
    await expectReason([{ name: "CV.TeX", data: Buffer.from(SAMPLE_TEX) }], "ok");
    await expectReason([{ name: "a.PNG", data: makePng() }, { name: "b.JPEG", data: makeJpg() }], "ok");
  });

  it("no extension, or a trailing dot, is unsupported", async () => {
    await expectReason([{ name: "resume", data: makePdf(1) }], "unsupported_type");
    await expectReason([{ name: "resume.", data: makePdf(1) }], "unsupported_type");
  });

  it("only the last extension counts: cv.pdf.exe is rejected, cv.exe.pdf (a real PDF) is fine", async () => {
    await expectReason([{ name: "cv.pdf.exe", data: makePdf(1) }], "unsupported_type");
    await expectReason([{ name: "cv.exe.pdf", data: makePdf(1) }], "ok");
  });

  it("legacy .doc and look-alike types are unsupported", async () => {
    for (const name of ["cv.doc", "cv.rtf", "cv.odt", "cv.pages", "cv.heic", "cv.webp", "cv.txt"]) await expectReason([{ name, data: makePdf(1) }], "unsupported_type");
  });

  it("the display name never carries a path or control characters", async () => {
    const r = await validateUpload([{ name: "../../etc/evil\r\nname.pdf", data: makePdf(1) }]);
    expect(r.displayName).not.toMatch(/[/\\\r\n\0]/);
    expect(r.displayName.endsWith(".pdf")).toBe(true);
  });

  it("a very long or blank name is capped / defaulted", async () => {
    expect((await validateUpload([{ name: `${"a".repeat(400)}.pdf`, data: makePdf(1) }])).displayName.length).toBeLessThanOrEqual(255);
    expect((await validateUpload([{ name: "   .pdf", data: makePdf(1) }])).displayName.length).toBeGreaterThan(0);
  });

  it("unicode names are kept", async () => {
    expect((await validateUpload([{ name: "Résumé – Visshnnu.pdf", data: makePdf(1) }])).displayName).toBe("Résumé – Visshnnu.pdf");
  });
});

describe("sizes and counts", () => {
  it("exactly 10 MB is accepted, one byte more is rejected", async () => {
    await expectReason([{ name: "a.png", data: padded(makePng(), MAX_UPLOAD_BYTES) }], "ok");
    await expectReason([{ name: "a.png", data: padded(makePng(), MAX_UPLOAD_BYTES + 1) }], "too_large");
  });

  it("the 10 MB limit is on the total across images, not per image", async () => {
    const half = Math.floor(MAX_UPLOAD_BYTES / 2) + 1;
    await expectReason([{ name: "a.png", data: padded(makePng(1), half) }, { name: "b.png", data: padded(makePng(2), half) }], "too_large");
  });

  it("a 0-page PDF is unreadable", async () => {
    await expectReason([{ name: "cv.pdf", data: makePdf(0) }], "unreadable");
  });

  it("an empty file among valid images is rejected", async () => {
    await expectReason([{ name: "a.png", data: makePng() }, { name: "b.png", data: new Uint8Array() }], "empty_file");
  });

  it("two documents together are rejected (only images combine)", async () => {
    await expectReason([{ name: "a.pdf", data: makePdf(1) }, { name: "b.pdf", data: makePdf(1) }], "mixed_types");
  });

  it("the same image uploaded twice as two pages is allowed and hashes differently from one", async () => {
    const one = await validateUpload([{ name: "a.png", data: makePng(1) }]);
    const two = await validateUpload([{ name: "a.png", data: makePng(1) }, { name: "a.png", data: makePng(1) }]);
    expect(two.pageCount).toBe(2);
    expect(two.hash).not.toBe(one.hash);
  });
});

describe("content checks", () => {
  it("a password-protected PDF gets its own message", async () => {
    const pdf = Buffer.from(makePdf(1)).toString("latin1").replace("trailer\n<<", "trailer\n<< /Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>");
    await expectReason([{ name: "cv.pdf", data: Buffer.from(pdf, "latin1") }], "encrypted_pdf");
  });

  it("a zip that isn't a Word document (no word/document.xml) is rejected", async () => {
    await expectReason([{ name: "cv.docx", data: makeZip({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>" }) }], "content_mismatch");
  });

  it(".tex that is binary or not LaTeX is rejected", async () => {
    await expectReason([{ name: "cv.tex", data: new Uint8Array([0xff, 0xfe, 0x00, 0x41]) }], "content_mismatch");
    await expectReason([{ name: "cv.tex", data: Buffer.from("Just a plain text resume, no LaTeX here.") }], "content_mismatch");
  });

  it(".tex with a UTF-8 BOM and Windows line endings is accepted", async () => {
    await expectReason([{ name: "cv.tex", data: Buffer.from(`\uFEFF${SAMPLE_TEX.replace(/\n/g, "\r\n")}`) }], "ok");
  });

  it("a truncated PNG / JPG (header only) is rejected, not crashed on", async () => {
    const r1 = await reasonOf(validateUpload([{ name: "a.png", data: makePng().slice(0, 8) }]));
    const r2 = await reasonOf(validateUpload([{ name: "a.jpg", data: makeJpg().slice(0, 3) }]));
    expect(r1).not.toMatch(/^unexpected|^ok$/);
    expect(r2).not.toMatch(/^unexpected|^ok$/);
  });

  it("a JPG named .png is a content mismatch (same strict rule as other renamed files)", async () => {
    await expectReason([{ name: "photo.png", data: makeJpg() }], "content_mismatch");
  });
});

describe("OCR quality gate boundaries", () => {
  it("exactly the threshold passes, just under fails, no words fails", () => {
    expect(isOcrQualityAcceptable([MIN_OCR_CONFIDENCE])).toBe(true);
    expect(isOcrQualityAcceptable([MIN_OCR_CONFIDENCE - 0.01])).toBe(false);
    expect(isOcrQualityAcceptable([])).toBe(false);
  });

  it("averages, so one blurry word doesn't sink a clear page", () => {
    expect(isOcrQualityAcceptable([95, 95, 95, 20])).toBe(true);
  });
});
