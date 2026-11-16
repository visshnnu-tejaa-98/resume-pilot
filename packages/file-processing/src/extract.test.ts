import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ExtractionError,
  extractText,
  inspectZip,
  MAX_TEXT_CHARS,
  normalizeText,
  type ExtractionFailure,
  type OcrEngine,
} from "./extract";
import {
  makePdf,
  makeResumeDocx,
  makeScannedPdf,
  makeTextPdf,
  makeZip,
  renderResumeImage,
  SAMPLE_RESUME_FACTS,
  SAMPLE_RESUME_TEX,
} from "./fixtures";
import { createTesseractOcr, type TesseractOcr } from "./ocr";

const reasonOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: unknown) => (e instanceof ExtractionError ? e.reason : `unexpected: ${String(e)}`),
  );

/** Every key fact (names, companies, numbers) must survive extraction. */
function expectAllFacts(text: string) {
  const flat = text.replace(/\s+/g, " ");
  for (const fact of SAMPLE_RESUME_FACTS) expect(flat, `missing "${fact}"`).toContain(fact);
}

describe("extraction on realistic resumes (real Tesseract OCR)", () => {
  let ocr: TesseractOcr;

  beforeAll(async () => {
    ocr = await createTesseractOcr();
  }, 60_000);

  afterAll(async () => {
    await ocr?.terminate();
  });

  it("PDF with a text layer: read directly, no OCR", async () => {
    const spy = vi.spyOn(ocr, "recognize");
    const result = await extractText("pdf", [makeTextPdf()], ocr);
    expectAllFacts(result.text);
    expect(result.pages).toEqual([expect.objectContaining({ method: "text_layer" })]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("scanned PDF (image only): falls back to OCR for that page", async () => {
    const result = await extractText("pdf", [await makeScannedPdf()], ocr);
    expectAllFacts(result.text);
    expect(result.pages[0]).toMatchObject({ method: "ocr" });
    expect(result.pages[0]!.ocrConfidence).toBeGreaterThanOrEqual(60);
  }, 60_000);

  it("DOCX: paragraphs come out as lines", async () => {
    const result = await extractText("docx", [makeResumeDocx()], ocr);
    expectAllFacts(result.text);
    expect(result.text.split("\n")).toContain("Senior Software Engineer, Flipkart");
  });

  it("LaTeX: body only, custom macros and \\href kept, preamble and comments dropped", async () => {
    const result = await extractText("tex", [Buffer.from(SAMPLE_RESUME_TEX)], ocr);
    expectAllFacts(result.text);
    expect(result.text).toContain(
      "Flipkart | Jan 2021 -- Present | Senior Software Engineer | Bengaluru",
    );
    expect(result.text).toContain("priya.raman@example.com (mailto:priya.raman@example.com)");
    expect(result.text).toContain("https://priya.dev");
    expect(result.text).toMatch(/^Experience$/m);
    expect(result.text).toContain("- Led migration");
    for (const leaked of [
      "documentclass",
      "usepackage",
      "newcommand",
      "hyperref",
      "Experience section",
    ]) {
      expect(result.text).not.toContain(leaked);
    }
  });

  it("images: each OCR'd as a page, in order", async () => {
    const page1 = await renderResumeImage({
      lines: ["Priya Raman", "Senior Software Engineer, Flipkart"],
    });
    const page2 = await renderResumeImage({
      lines: ["EDUCATION", "B.Tech Computer Science, NIT Trichy"],
    });
    const result = await extractText("png", [page1.data, page2.data], ocr);
    expect(result.pages).toHaveLength(2);
    expect(result.text.indexOf("Flipkart")).toBeLessThan(result.text.indexOf("NIT Trichy"));
  }, 60_000);

  it("a full-page phone-photo style image passes the quality gate", async () => {
    const { data } = await renderResumeImage({ format: "jpeg" });
    const result = await extractText("jpg", [data], ocr);
    expectAllFacts(result.text);
  }, 60_000);

  it("a blurry, noisy image is rejected with the 'clearer file' message", async () => {
    const { data } = await renderResumeImage({ degrade: true });
    const err = await extractText("png", [data], ocr).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).reason).toBe("low_quality_image");
    expect((err as ExtractionError).message).toMatch(/clearer/);
  }, 60_000);
});

describe("extraction failures (fake OCR)", () => {
  const fakeOcr = (text: string, confidences: number[]): OcrEngine => ({
    recognize: async () => ({ text, wordConfidences: confidences }),
  });
  const fails = (p: Promise<unknown>, reason: ExtractionFailure) =>
    expect(reasonOf(p)).resolves.toBe(reason);

  it("a blank PDF (no text, OCR finds nothing) is 'no_text'", () =>
    fails(extractText("pdf", [makePdf(1)], fakeOcr("", [])), "low_quality_image"));

  it("OCR that reads only a few words is 'no_text'", () =>
    fails(extractText("png", [Buffer.from("x")], fakeOcr("hi", [95])), "no_text"));

  it("a DOCX over 5 pages is 'too_long'", () =>
    fails(extractText("docx", [makeResumeDocx(undefined, 6)], fakeOcr("", [])), "too_long"));

  it("text past the length cap is 'too_long'", () =>
    fails(
      extractText(
        "tex",
        [Buffer.from(`\\begin{document}${"word ".repeat(MAX_TEXT_CHARS)}\\end{document}`)],
        fakeOcr("", []),
      ),
      "too_long",
    ));

  it("a zip bomb disguised as .docx is refused before anything is inflated", async () => {
    const bomb = Buffer.from(makeZip({ "word/document.xml": "x" }));
    // Rewrite the central directory's declared uncompressed size to 4 GB.
    const cd = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(0xffffffff, cd + 24);
    expect(inspectZip(bomb).uncompressedBytes).toBe(0xffffffff);
    await fails(extractText("docx", [bomb], fakeOcr("", [])), "unsafe_archive");
  });

  it("corrupt files are 'unreadable', not crashes", async () => {
    await fails(
      extractText("pdf", [Buffer.from("%PDF-1.7 nonsense")], fakeOcr("", [])),
      "unreadable",
    );
    await fails(
      extractText("docx", [Buffer.from("not a zip at all")], fakeOcr("", [])),
      "unreadable",
    );
    await fails(
      extractText("tex", [Buffer.from([0xff, 0xfe, 0x00])], fakeOcr("", [])),
      "unreadable",
    );
  });
});

describe("normalizeText", () => {
  it("collapses spaces and blank lines and trims", () => {
    expect(normalizeText("  a\t\tb  \r\n\r\n\r\n\r\nc\u00a0d  ")).toBe("a b\n\nc d");
  });
});
