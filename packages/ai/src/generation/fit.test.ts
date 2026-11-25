import { describe, expect, it } from "vitest";
import { parseScoringEvaluation } from "../scoring/schema";
import { assembleVersion } from "./assemble";
import { RESUMES } from "./fixtures";
import { estimatePages, fitPlanToPages, targetPagesFor } from "./fit";
import { checkGrounding } from "./grounding";
import type { GenerationPlan } from "./plan";

const source = Object.values(RESUMES)[0]!;

/** A plan that repeats every source bullet many times — far over any page budget. */
function bloatedPlan(): GenerationPlan {
  const many = <B extends { id: string; text: string }>(bs: B[]) =>
    Array.from({ length: 12 }, (_, i) => bs[i % bs.length]!).map((b) => ({ text: b.text, sourceBulletIds: [b.id], changeType: "unchanged" as const }));
  return {
    summary: source.summary.text,
    sectionOrder: [],
    workExperience: source.workExperience.map((w) => ({ id: w.id, bullets: many(w.bullets) })),
    projects: source.projects.map((p) => ({ id: p.id, bullets: many(p.bullets).slice(0, 8) })),
    skills: [],
    gaps: [],
  };
}

describe("page fitting", () => {
  it("targets the upload's page count, capped at 3, defaulting to 2", () => {
    expect(targetPagesFor(1)).toBe(1);
    expect(targetPagesFor(2)).toBe(2);
    expect(targetPagesFor(5)).toBe(3);
    expect(targetPagesFor(null)).toBe(2);
  });

  it("trims bullets until the estimate fits, keeping at least 2 per job", () => {
    const plan = bloatedPlan();
    const before = estimatePages(assembleVersion(source, plan).resume);
    const fitted = fitPlanToPages(source, plan, 1);
    const after = assembleVersion(source, fitted).resume;
    expect(estimatePages(after)).toBeLessThan(before);
    for (const w of fitted.workExperience) expect(w.bullets.length).toBeGreaterThanOrEqual(Math.min(2, before > 0 ? 2 : 0));
  });

  it("leaves a plan that already fits untouched", () => {
    const plan = { ...bloatedPlan(), workExperience: source.workExperience.map((w) => ({ id: w.id, bullets: [] })), projects: [] };
    const fitted = fitPlanToPages(source, plan, 3);
    expect(assembleVersion(source, fitted).resume.workExperience).toEqual(assembleVersion(source, plan).resume.workExperience);
  });

  it("trimming never introduces a grounding violation", () => {
    const fitted = fitPlanToPages(source, bloatedPlan(), 1);
    const a = assembleVersion(source, fitted);
    const rules = checkGrounding({ source, output: a.resume, provenance: a.provenance, terms: { groups: [] } }).map((v) => v.rule);
    expect(rules).toEqual([]);
  });
});

describe("scoring output caps", () => {
  it("trims oversize arrays instead of failing the run", () => {
    const r = parseScoringEvaluation({
      requirements: [{ requirementId: "r1", status: "matched", evidenceIds: ["a", "b", "c", "d", "e", "f", "g", "h"], reason: "x".repeat(500) }],
      assessment: "ok",
      recommendations: [],
    });
    expect(r.requirements[0]!.evidenceIds).toHaveLength(6);
    expect(r.requirements[0]!.reason).toHaveLength(300);
  });

  it("still rejects wrong types", () => {
    expect(() => parseScoringEvaluation({ requirements: [{ requirementId: "r1", status: "nope", evidenceIds: [], reason: "" }], assessment: "", recommendations: [] })).toThrow();
  });
});
