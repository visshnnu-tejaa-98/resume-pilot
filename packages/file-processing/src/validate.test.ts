import { describe, expect, it } from "vitest";
import { makeDocx, makeExe, makeJpg, makePdf, makePng, makeZip, SAMPLE_TEX } from "./fixtures";
import {
  countPdfPages,
  isOcrQualityAcceptable,
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateUpload,
  type UploadRejection,
} from "./validate";

const reasonOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof UploadValidationError ? e.reason : `unexpected: ${String(e)}`),
  );
const reject = (files: Parameters<typeof validateUpload>[0], reason: UploadRejection) =>
  expect(reasonOf(validateUpload(files))).resolves.toBe(reason);

describe("validateUpload: accepted formats", () => {
  it("accepts a PDF and counts its pages", async () => {
    const result = await validateUpload([{ name: "Jane Resume.PDF", data: makePdf(2) }]);
    expect(result).toMatchObject({ format: "pdf", pageCount: 2, displayName: "Jane Resume.PDF" });
    expect(result.files[0]?.mimeType).toBe("application/pdf");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts .docx by its zip contents", async () => {
    const result = await validateUpload([{ name: "cv.docx", data: makeDocx() }]);
    expect(result.format).toBe("docx");
  });

  it("accepts LaTeX source", async () => {
    const result = await validateUpload([{ name: "cv.tex", data: Buffer.from(SAMPLE_TEX) }]);
    expect(result).toMatchObject({ format: "tex", pageCount: 1 });
  });

  it("accepts up to 5 images (png/jpg/jpeg mixed) as pages of one resume", async () => {
    const result = await validateUpload([
      { name: "p1.png", data: makePng(1) },
      { name: "p2.jpg", data: makeJpg() },
      { name: "p3.jpeg", data: makeJpg() },
      { name: "p4.png", data: makePng(4) },
      { name: "p5.png", data: makePng(5) },
    ]);
    expect(result).toMatchObject({ format: "png", pageCount: 5 });
    expect(result.files.map((f) => f.extension)).toEqual(["png", "jpg", "jpeg", "png", "png"]);
  });
});

describe("validateUpload: done-when — mismatched content is rejected", () => {
  it("rejects a Windows .exe renamed to .pdf", () =>
    reject([{ name: "resume.pdf", data: makeExe() }], "content_mismatch"));
  it("rejects a .exe renamed to .png / .docx / .tex", async () => {
    await reject([{ name: "photo.png", data: makeExe() }], "content_mismatch");
    await reject([{ name: "cv.docx", data: makeExe() }], "content_mismatch");
    await reject([{ name: "cv.tex", data: makeExe() }], "content_mismatch");
  });
  it("rejects a PDF renamed to .docx and a PNG renamed to .pdf", async () => {
    await reject([{ name: "cv.docx", data: makePdf(1) }], "content_mismatch");
    await reject([{ name: "cv.pdf", data: makePng() }], "content_mismatch");
  });
  it("rejects a plain zip renamed to .docx", () =>
    reject([{ name: "cv.docx", data: makeZip({ "readme.txt": "hi" }) }], "content_mismatch"));
  it("rejects text that isn't LaTeX renamed to .tex", () =>
    reject(
      [{ name: "cv.tex", data: Buffer.from("just some notes, no latex here") }],
      "content_mismatch",
    ));
});

describe("validateUpload: limits", () => {
  it("rejects unsupported extensions, even with valid content", async () => {
    await reject([{ name: "cv.doc", data: makeDocx() }], "unsupported_type");
    await reject([{ name: "cv.exe", data: makeExe() }], "unsupported_type");
    await reject([{ name: "noextension", data: makePdf(1) }], "unsupported_type");
  });

  it("rejects more than 10 MB in total", async () => {
    const big = Buffer.concat([Buffer.from(makePdf(1)), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    await reject([{ name: "cv.pdf", data: big }], "too_large");
  });

  it("rejects a PDF over 5 pages, accepts exactly 5", async () => {
    await reject([{ name: "cv.pdf", data: makePdf(6) }], "too_many_pages");
    await expect(validateUpload([{ name: "cv.pdf", data: makePdf(5) }])).resolves.toMatchObject({
      pageCount: 5,
    });
  });

  it("rejects 6 images", () =>
    reject(
      Array.from({ length: 6 }, (_, i) => ({ name: `p${i}.png`, data: makePng(i) })),
      "too_many_files",
    ));

  it("rejects documents combined with anything else", async () => {
    await reject(
      [
        { name: "a.pdf", data: makePdf(1) },
        { name: "b.png", data: makePng() },
      ],
      "mixed_types",
    );
    await reject(
      [
        { name: "a.pdf", data: makePdf(1) },
        { name: "b.pdf", data: makePdf(1) },
      ],
      "mixed_types",
    );
  });

  it("rejects empty input and empty files", async () => {
    await reject([], "no_files");
    await reject([{ name: "cv.pdf", data: new Uint8Array() }], "empty_file");
  });

  it("rejects a corrupt PDF that only has the magic bytes", () =>
    reject(
      [{ name: "cv.pdf", data: Buffer.from("%PDF-1.7\ngarbage, no objects at all") }],
      "unreadable",
    ));
});

describe("hash for duplicate detection", () => {
  it("is the same for the same bytes regardless of file name", async () => {
    const data = makePdf(1);
    const a = await validateUpload([{ name: "a.pdf", data }]);
    const b = await validateUpload([{ name: "renamed.pdf", data }]);
    expect(a.hash).toBe(b.hash);
  });

  it("differs for different content, and depends on image order", async () => {
    const one = await validateUpload([{ name: "a.pdf", data: makePdf(1) }]);
    const two = await validateUpload([{ name: "a.pdf", data: makePdf(2) }]);
    expect(one.hash).not.toBe(two.hash);

    const ab = await validateUpload([
      { name: "1.png", data: makePng(1) },
      { name: "2.png", data: makePng(2) },
    ]);
    const ba = await validateUpload([
      { name: "1.png", data: makePng(2) },
      { name: "2.png", data: makePng(1) },
    ]);
    expect(ab.hash).not.toBe(ba.hash);
  });
});

describe("countPdfPages", () => {
  it("reads the page count from a real PDF", async () => {
    expect(await countPdfPages(makePdf(3))).toBe(3);
  });
});

describe("isOcrQualityAcceptable", () => {
  it("rejects when average word confidence is below 60", () => {
    expect(isOcrQualityAcceptable([90, 80, 70])).toBe(true);
    expect(isOcrQualityAcceptable([60, 60])).toBe(true);
    expect(isOcrQualityAcceptable([70, 40, 50])).toBe(false);
    expect(isOcrQualityAcceptable([])).toBe(false);
    expect(isOcrQualityAcceptable([75], 80)).toBe(false);
  });
});
