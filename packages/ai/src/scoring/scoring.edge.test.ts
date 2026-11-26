import { describe, expect, it, vi } from "vitest";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import type { JdAnalysis } from "@resume-pilot/validators";
import { JD_ANALYSES, RESUMES } from "../generation/fixtures";
import type { ResponsesClient } from "../responses";
import { candidateYears, computeScore } from "./engine";
import { scoreResume } from "./report";
import { parseScoringEvaluation, type ScoringEvaluation } from "./schema";

/** Edge cases for ATS scoring (prd.md §9): odd inputs must never give NaN, < 0, > 100 or a crash. */

const resume = RESUMES.frontend!;
const fe = JD_ANALYSES.fe!;
const asOf = new Date("2026-11-17T00:00:00Z");
const ev = (requirements: ScoringEvaluation["requirements"]): ScoringEvaluation => ({ requirements, assessment: "", recommendations: [] });
const all = (status: "matched" | "partial" | "missing", a: JdAnalysis = fe) => ev(a.requirements.map((r) => ({ requirementId: r.id, status, evidenceIds: status === "missing" ? [] : ["b_1"], reason: "" })));
const sane = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
const jd = (over: Partial<JdAnalysis>): JdAnalysis => ({ jobTitle: null, seniority: null, minYearsExperience: null, requirements: [], educationRequirements: [], domainTerms: [], ...over });
const d = (value: string | null, raw: string) => ({ value, raw });

describe("computeScore: odd analyses", () => {
  it("a JD with zero requirements gives a finite score in range (no divide-by-zero)", () => {
    const s = computeScore({ resume, analysis: jd({}), evaluation: ev([]), asOf });
    expect(sane(s.overall)).toBe(true);
    for (const x of s.dimensions) expect(Number.isFinite(x.points)).toBe(true);
  });

  it("everything matched ≤ 100, everything missing ≥ 0, and matched beats missing", () => {
    const hi = computeScore({ resume, analysis: fe, evaluation: all("matched"), asOf }).overall;
    const lo = computeScore({ resume, analysis: fe, evaluation: all("missing"), asOf }).overall;
    expect(sane(hi) && sane(lo)).toBe(true);
    expect(hi).toBeGreaterThan(lo);
  });

  it("only preferred requirements (no required ones) still scores sanely", () => {
    const a = jd({ requirements: fe.requirements.map((r) => ({ ...r, priority: "preferred" as const })) });
    expect(sane(computeScore({ resume, analysis: a, evaluation: all("matched", a), asOf }).overall)).toBe(true);
  });
});

describe("computeScore: odd model judgements", () => {
  it("judgements for requirement ids that don't exist are ignored", () => {
    const base = computeScore({ resume, analysis: fe, evaluation: all("matched"), asOf });
    const extra = all("matched");
    extra.requirements.push({ requirementId: "r99", status: "missing", evidenceIds: [], reason: "" });
    expect(computeScore({ resume, analysis: fe, evaluation: extra, asOf }).overall).toBe(base.overall);
  });

  it("a requirement judged twice is counted once", () => {
    const twice = all("matched");
    twice.requirements.push({ ...twice.requirements[0]!, status: "missing", evidenceIds: [] });
    const s = computeScore({ resume, analysis: fe, evaluation: twice, asOf });
    expect(s.requirements.filter((r) => r.id === fe.requirements[0]!.id)).toHaveLength(1);
  });

  it("evidence pointing at an empty summary or a non-existent item is dropped", () => {
    const r = structuredClone(resume);
    r.summary.text = "";
    const e = ev([{ requirementId: "r1", status: "matched", evidenceIds: ["summary", "nope"], reason: "" }]);
    const s = computeScore({ resume: r, analysis: fe, evaluation: e, asOf });
    const r1 = s.requirements.find((x) => x.id === "r1")!;
    expect(r1.evidence.map((e) => e.id)).toEqual([]);
  });

  it("the model saying 'matched' with no valid evidence doesn't count as matched", () => {
    const e = ev(fe.requirements.map((r) => ({ requirementId: r.id, status: "matched", evidenceIds: ["ghost"], reason: "" })));
    const fake = computeScore({ resume, analysis: fe, evaluation: e, asOf }).overall;
    const real = computeScore({ resume, analysis: fe, evaluation: all("matched"), asOf }).overall;
    expect(fake).toBeLessThan(real);
  });
});

describe("computeScore: odd resumes", () => {
  it("a near-empty resume (no jobs, no skills) scores in range with 0 years", () => {
    const empty = resumeSchema.parse({ schemaVersion: "2.0" });
    const s = computeScore({ resume: empty, analysis: fe, evaluation: all("missing"), asOf });
    expect(sane(s.overall)).toBe(true);
    expect(s.years).toBe(0);
  });

  it("a JD asking for years the resume can't show still scores in range", () => {
    expect(sane(computeScore({ resume, analysis: { ...fe, minYearsExperience: 50 }, evaluation: all("matched"), asOf }).overall)).toBe(true);
  });
});

describe("candidateYears: dates", () => {
  const withJobs = (...jobs: { start: [string | null, string]; end: [string | null, string]; current?: boolean }[]): Resume =>
    resumeSchema.parse({
      schemaVersion: "2.0",
      workExperience: jobs.map((j, i) => ({ id: `we_${i + 1}`, company: "Co", designation: "Eng", startDate: d(...j.start), endDate: d(...j.end), isCurrent: !!j.current, bullets: [] })),
    });

  it("unparseable dates are skipped, not NaN", () => {
    expect(candidateYears(withJobs({ start: [null, "sometime"], end: [null, "later"] }), asOf)).toBe(0);
  });

  it("a start date in the future never gives negative years", () => {
    expect(candidateYears(withJobs({ start: ["2030-01", "Jan 2030"], end: [null, "Present"], current: true }), asOf)).toBeGreaterThanOrEqual(0);
  });

  it("end before start (typo) is rejected by the resume schema, so it never reaches scoring", () => {
    expect(() => withJobs({ start: ["2024-01", "Jan 2024"], end: ["2020-01", "Jan 2020"] })).toThrow(/End date is before start date/);
  });

  it("a current job with only a start year counts up to asOf", () => {
    const y = candidateYears(withJobs({ start: ["2024", "2024"], end: [null, "Present"], current: true }), asOf);
    expect(y).toBeGreaterThan(2);
    expect(y).toBeLessThan(3.5);
  });

  it("identical duplicate jobs aren't double-counted", () => {
    const one = candidateYears(withJobs({ start: ["2020-01", "Jan 2020"], end: ["2022-01", "Jan 2022"] }), asOf);
    const two = candidateYears(withJobs({ start: ["2020-01", "Jan 2020"], end: ["2022-01", "Jan 2022"] }, { start: ["2020-01", "Jan 2020"], end: ["2022-01", "Jan 2022"] }), asOf);
    expect(two).toBe(one);
  });
});

describe("parseScoringEvaluation: oversized model output", () => {
  it("clamps too many evidence ids and too-long reasons instead of failing the whole score", () => {
    const e = parseScoringEvaluation({
      requirements: [{ requirementId: "r1", status: "matched", evidenceIds: Array.from({ length: 12 }, (_, i) => `b_${i}`), reason: "x".repeat(900) }],
      assessment: "y".repeat(3000),
      recommendations: Array.from({ length: 15 }, () => ({ area: "bullets", title: "t", detail: "d" })),
    });
    expect(e.requirements[0]!.evidenceIds.length).toBeLessThanOrEqual(6);
    expect(e.requirements[0]!.reason.length).toBeLessThanOrEqual(300);
    expect(e.recommendations.length).toBeLessThanOrEqual(8);
  });

  it("rejects a status that isn't matched/partial/missing", () => {
    expect(() => parseScoringEvaluation({ requirements: [{ requirementId: "r1", status: "great", evidenceIds: [], reason: "" }], assessment: "", recommendations: [] })).toThrow();
  });

  it("rejects non-object output", () => {
    for (const bad of [null, [], "text", 3]) expect(() => parseScoringEvaluation(bad)).toThrow();
  });
});

describe("scoreResume: the AI round trip", () => {
  const client = (response: Record<string, unknown>) =>
    ({ responses: { create: vi.fn(async () => ({ status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 }, ...response })) } }) as unknown as ResponsesClient;

  it("a truncated evaluation (max_output_tokens) fails — no partial report is built", async () => {
    await expect(scoreResume(client({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "{" }), { resume, analysis: fe, model: "gpt-5-mini", maxOutputTokens: 100, asOf })).rejects.toMatchObject({ kind: "incomplete" });
  });

  it("the model skipping every requirement still yields a report (all missing), not a crash", async () => {
    const r = await scoreResume(client({ output_text: JSON.stringify({ requirements: [], assessment: "", recommendations: [] }) }), { resume, analysis: fe, model: "gpt-5-mini", maxOutputTokens: 5000, asOf });
    expect(r.report.requirements.every((x) => x.status === "missing")).toBe(true);
    expect(sane(r.overallScore)).toBe(true);
  });
});
