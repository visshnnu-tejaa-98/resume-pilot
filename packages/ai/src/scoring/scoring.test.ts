import { describe, expect, it, vi } from "vitest";
import { JD_ANALYSES, RESUMES } from "../generation/fixtures";
import type { ResponsesClient } from "../responses";
import { candidateYears, computeScore, DIMENSIONS, keywordHits, SCORE_DISCLAIMER, structureChecks, visibleResume } from "./engine";
import type { ScoringEvaluation } from "./schema";
import { evaluateResume } from "./score";

const resume = RESUMES.frontend!;
const analysis = JD_ANALYSES.fe!; // r1 React (req), r2 TypeScript (req), r3 GraphQL (pref)
const asOf = new Date("2026-11-17T00:00:00Z");

const evaluation: ScoringEvaluation = {
  requirements: [
    { requirementId: "r1", status: "matched", evidenceIds: ["b_1", "s_5"], reason: "Built a React design system" },
    { requirementId: "r2", status: "matched", evidenceIds: ["b_1"], reason: "TypeScript in current role" },
    { requirementId: "r3", status: "missing", evidenceIds: [], reason: "No GraphQL" },
  ],
  assessment: "Strong React and TypeScript fit; GraphQL is the main gap.",
  recommendations: [{ area: "summary", title: "Lead with the design system", detail: "It's the job's main ask." }],
};

describe("computeScore", () => {
  it("weights add up to 100", () => {
    expect(DIMENSIONS.reduce((n, d) => n + d.weightPct, 0)).toBe(100);
  });

  it("DONE WHEN: same content + same JD + same judgement → identical score, every time", () => {
    const a = computeScore({ resume, analysis, evaluation, asOf });
    const b = computeScore({ resume: structuredClone(resume), analysis: structuredClone(analysis), evaluation: structuredClone(evaluation), asOf: new Date(asOf) });
    // Inputs as stored in ats_reports and read back (jsonb round-trip).
    const stored = JSON.parse(JSON.stringify({ resume, analysis, evaluation })) as { resume: typeof resume; analysis: typeof analysis; evaluation: ScoringEvaluation };
    const c = computeScore({ ...stored, asOf: new Date(asOf.toISOString()) });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("scores each dimension from its own inputs", () => {
    const s = computeScore({ resume, analysis, evaluation, asOf });
    const d = Object.fromEntries(s.dimensions.map((x) => [x.key, x.points]));
    expect(d.keywords).toBe(30); // both required keywords present
    expect(d.skills).toBe(20); // r1 1 + r2 1 + r3 0×0.5 → 2/2.5
    expect(d.education).toBe(10); // no education requirements → full
    expect(s.overall).toBe(s.dimensions.reduce((n, x) => n + x.points, 0));
    expect(s.requirements.find((r) => r.id === "r1")!.evidence.map((e) => e.id)).toEqual(["b_1", "s_5"]);
  });

  it("drops evidence ids that aren't in the resume; a match with none left counts as missing", () => {
    const fake: ScoringEvaluation = { ...evaluation, requirements: [{ requirementId: "r3", status: "matched", evidenceIds: ["b_999", "made_up"], reason: "GraphQL work" }, ...evaluation.requirements.slice(0, 2)] };
    const s = computeScore({ resume, analysis, evaluation: fake, asOf });
    const r3 = s.requirements.find((r) => r.id === "r3")!;
    expect(r3.status).toBe("missing");
    expect(r3.evidence).toEqual([]);
  });

  it("a requirement the model skipped counts as missing", () => {
    const s = computeScore({ resume, analysis, evaluation: { ...evaluation, requirements: [] }, asOf });
    expect(s.requirements.every((r) => r.status === "missing")).toBe(true);
  });

  it("hidden sections/items aren't scored or cited", () => {
    const hidden = structuredClone(resume);
    hidden.layout.hiddenItems.push("b_1");
    const s = computeScore({ resume: hidden, analysis, evaluation, asOf });
    expect(s.requirements.find((r) => r.id === "r2")!.evidence).toEqual([]);
    expect(visibleResume(hidden).workExperience[0]!.bullets.map((b) => b.id)).not.toContain("b_1");
  });
});

describe("deterministic checks", () => {
  it("keyword presence uses synonyms and skills", () => {
    const hits = keywordHits(resume, analysis);
    expect(hits.find((h) => h.requirementId === "r1")!.found).toEqual(["React"]);
    expect(hits.find((h) => h.requirementId === "r3")!.missing).toEqual(["GraphQL"]);
  });

  it("years: overlapping roles counted once, current role runs to asOf", () => {
    // Globex 2021 → Jun 2023, Northwind Jul 2023 → now (Nov 2026)
    expect(candidateYears(resume, asOf)).toBeCloseTo(5.8, 1);
    const overlap = structuredClone(resume);
    overlap.workExperience[1]!.endDate = { value: "2024-12", raw: "Dec 2024" };
    expect(candidateYears(overlap, asOf)).toBeCloseTo(5.8, 1);
  });

  it("structure checks flag missing contact info and unreadable dates", () => {
    const bad = structuredClone(resume);
    bad.personalInfo.email = "";
    bad.workExperience[1]!.startDate = { value: null, raw: "" };
    bad.workExperience[1]!.endDate = { value: null, raw: "" };
    const failed = structureChecks(bad).filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["contact", "dates"]));
    expect(structureChecks(resume).every((c) => c.passed)).toBe(true);
  });

  it("exposes the required disclaimer", () => {
    expect(SCORE_DISCLAIMER).toBe("Estimated compatibility score. Employers' ATS systems differ; this is not a guarantee.");
  });
});

describe("evaluateResume", () => {
  it("sends visible resume + analysis as data and validates the judgement", async () => {
    const create = vi.fn(async (_p: { input: { content: string }[] }) => ({ status: "completed", output: [], output_text: JSON.stringify(evaluation), usage: { input_tokens: 2000, output_tokens: 400 } }) as never);
    const client = { responses: { create } } as ResponsesClient;
    const r = await evaluateResume(client, { resume, analysis, model: "m", maxOutputTokens: 2500 });
    expect(r.evaluation.requirements).toHaveLength(3);
    const input = create.mock.calls[0]![0].input[0]!.content;
    expect(input).toContain("<resume>");
    expect(input).toContain("<job_analysis>");
    expect(input).not.toContain('"layout"');
  });
});
