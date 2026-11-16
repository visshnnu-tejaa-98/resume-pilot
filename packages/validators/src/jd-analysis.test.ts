import { describe, expect, it } from "vitest";
import { fromJdAnalysisOutput, JdAnalysisOutputError, jdAnalysisJsonSchema, topKeywords } from "./jd-analysis";

const valid = {
  jobTitle: "Frontend Engineer",
  seniority: "Mid",
  minYearsExperience: 4,
  requirements: [
    { text: "4+ years of React", type: "skill", priority: "required", keywords: ["React", "react"], synonyms: ["React.js"] },
    { text: "GraphQL nice to have", type: "skill", priority: "preferred", keywords: ["GraphQL"], synonyms: [] },
    { text: "TypeScript", type: "skill", priority: "required", keywords: ["TypeScript"], synonyms: ["TS"] },
  ],
  educationRequirements: ["B.Tech in CS or equivalent"],
  domainTerms: ["design systems", "Design Systems", "accessibility"],
};

describe("jd analysis schema", () => {
  it("assigns stable ids r1..rN and dedupes keywords/terms case-insensitively", () => {
    const a = fromJdAnalysisOutput(valid);
    expect(a.requirements.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(a.requirements[0]!.keywords).toEqual(["React"]);
    expect(a.domainTerms).toEqual(["design systems", "accessibility"]);
  });

  it("rejects structurally wrong output", () => {
    expect(() => fromJdAnalysisOutput({ ...valid, requirements: [{ text: "x", type: "vibe", priority: "required", keywords: [], synonyms: [] }] })).toThrow(JdAnalysisOutputError);
    expect(() => fromJdAnalysisOutput(null)).toThrow(JdAnalysisOutputError);
  });

  it("truncates over-long lists instead of failing", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ text: `req ${i}`, type: "skill", priority: "required", keywords: [`k${i}`], synonyms: [] }));
    expect(fromJdAnalysisOutput({ ...valid, requirements: many }).requirements).toHaveLength(60);
  });

  it("strict JSON schema: every object closed and fully required, no ids", () => {
    const s = jdAnalysisJsonSchema() as { required: string[]; additionalProperties: boolean; properties: Record<string, { items?: { required?: string[] } }> };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["jobTitle", "seniority", "minYearsExperience", "requirements", "educationRequirements", "domainTerms"]);
    expect(s.properties.requirements!.items!.required).not.toContain("id");
    expect(JSON.stringify(s)).not.toMatch(/maxLength|minLength|maxItems|"maximum"|"default"/);
  });

  it("topKeywords puts required before preferred", () => {
    expect(topKeywords(fromJdAnalysisOutput(valid), 3)).toEqual(["React", "TypeScript", "GraphQL"]);
  });
});
