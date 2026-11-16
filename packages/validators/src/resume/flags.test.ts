import { describe, expect, it } from "vitest";
import { flagExtraction } from "./flags";
import { resumeMetaSchema, resumeSchema, unreviewedLowConfidence } from "./schema";

const resume = resumeSchema.parse({
  schemaVersion: "2.0",
  personalInfo: {
    firstName: "Priya",
    lastName: "Raman",
    email: "priya@example.com",
    phone: "+91 98450 12345",
  },
  workExperience: [
    {
      id: "we_1",
      company: "Flipkart",
      designation: "Senior Software Engineer",
      startDate: { value: "2021-01", raw: "Jan 2021" },
      isCurrent: true,
      bullets: [{ id: "b_1", text: "Cut checkout p95 latency by 38%" }],
    },
    {
      id: "we_2",
      company: "Zoho",
      designation: "Software Engineer",
      startDate: { value: "2017", raw: "2017" },
      endDate: { value: "2020", raw: "2020" },
      bullets: [{ id: "b_2", text: "Built invoicing APIs" }],
    },
  ],
  education: [
    {
      id: "ed_1",
      institution: "NIT Trichy",
      degree: "B.Tech",
      endDate: { value: "2017", raw: "2017" },
    },
  ],
});

const rawText = `Priya Raman
priya@example.com | +91 98450 12345
Senior Software Engineer, Flipkart  Jan 2021 - Present
Cut checkout p95 latency by 38%
Software Engineer, Zoho 2017 - 2020
Built invoicing APIs
B.Tech, NIT Trichy, 2017`;

describe("flagExtraction", () => {
  it("flags nothing for clean text-layer extraction, except year-only job dates", () => {
    const meta = flagExtraction(resume, { rawText });
    expect(Object.keys(meta).sort()).toEqual([
      "workExperience[id=we_2].endDate",
      "workExperience[id=we_2].startDate",
    ]);
    expect(meta["workExperience[id=we_2].startDate"]).toMatchObject({
      confidence: "low",
      reason: "Only year found",
      source: { kind: "partial_date" },
    });
    // Year-only education dates are normal and not flagged.
    expect(meta["education[id=ed_1].endDate"]).toBeUndefined();
  });

  it("done-when: a field read from a low-confidence OCR line is flagged and traceable to it", () => {
    const meta = flagExtraction(resume, {
      rawText,
      lowConfidenceLines: [
        { page: 1, text: "Senior Software Engineer, Flipkart  Jan 2021 - Present", confidence: 52 },
        { page: 2, text: "Built invoicing APIs", confidence: 68 },
      ],
    });

    expect(meta["workExperience[id=we_1].company"]).toEqual({
      confidence: "low",
      reason: "Read by OCR at 52% confidence (page 1). Check it's right.",
      reviewed: false,
      source: {
        kind: "ocr_line",
        page: 1,
        line: "Senior Software Engineer, Flipkart  Jan 2021 - Present",
        ocrConfidence: 52,
      },
    });
    expect(meta["workExperience[id=we_1].designation"]?.source?.ocrConfidence).toBe(52);
    expect(meta["workExperience[id=we_1].startDate"]?.confidence).toBe("low");
    // 60–74% is medium.
    expect(meta["workExperience[id=we_2].bullets[id=b_2]"]).toMatchObject({
      confidence: "medium",
      source: { kind: "ocr_line", page: 2, ocrConfidence: 68 },
    });
    // Fields from confident lines aren't flagged.
    expect(meta["workExperience[id=we_1].bullets[id=b_1]"]).toBeUndefined();
    expect(meta["personalInfo.email"]).toBeUndefined();
  });

  it("picks the lowest-confidence line when a value appears on several", () => {
    const meta = flagExtraction(resume, {
      rawText,
      lowConfidenceLines: [
        { page: 1, text: "Flipkart", confidence: 70 },
        { page: 1, text: "Senior Software Engineer at Flipkart", confidence: 41 },
      ],
    });
    expect(meta["workExperience[id=we_1].company"]?.source?.ocrConfidence).toBe(41);
  });

  it("flags key facts that don't appear in the uploaded text (possible invention)", () => {
    const invented = resumeSchema.parse({
      ...resume,
      workExperience: [{ ...resume.workExperience[0]!, company: "Google" }],
      education: [{ ...resume.education[0]!, degree: "PhD" }],
      personalInfo: { ...resume.personalInfo, phone: "+1 555 0100 999" },
    });
    const meta = flagExtraction(invented, { rawText });
    expect(meta["workExperience[id=we_1].company"]).toMatchObject({
      confidence: "low",
      source: { kind: "not_in_source" },
    });
    expect(meta["education[id=ed_1].degree"]).toMatchObject({ source: { kind: "not_in_source" } });
    expect(meta["personalInfo.phone"]).toMatchObject({ source: { kind: "not_in_source" } });
  });

  it("matches phone numbers by digits, whatever the formatting", () => {
    const reformatted = resumeSchema.parse({
      ...resume,
      personalInfo: { ...resume.personalInfo, phone: "9845012345" },
    });
    expect(flagExtraction(reformatted, { rawText })["personalInfo.phone"]).toBeUndefined();
  });

  it("a low flag beats a medium one on the same field", () => {
    const meta = flagExtraction(resume, {
      rawText: rawText.replace("Zoho", "Z0ho"),
      lowConfidenceLines: [
        { page: 1, text: "Software Engineer, Zoho 2017 - 2020", confidence: 70 },
      ],
    });
    expect(meta["workExperience[id=we_2].company"]).toMatchObject({
      confidence: "low",
      source: { kind: "not_in_source" },
    });
  });

  it("output is valid §6.2 metadata and feeds the review gate", () => {
    const meta = flagExtraction(resume, {
      rawText,
      lowConfidenceLines: [{ page: 1, text: "Senior Software Engineer, Flipkart", confidence: 52 }],
    });
    expect(resumeMetaSchema.safeParse({ extractionMeta: meta }).success).toBe(true);
    expect(unreviewedLowConfidence(meta)).toContain("workExperience[id=we_1].company");
  });
});
