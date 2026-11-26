import { describe, expect, it, vi } from "vitest";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import type { JdAnalysis } from "@resume-pilot/validators";
import type { ResponsesClient } from "../responses";
import { StructuringError } from "../responses";
import { assembleVersion } from "./assemble";
import { JD_ANALYSES, RESUMES } from "./fixtures";
import { generateTailoredResume, GroundingFailedError } from "./generate";
import { checkGrounding, ungroundedJdTerms } from "./grounding";
import type { GenerationPlan } from "./plan";
import { mentions, numbersIn } from "./terms";

/** Edge cases for resume generation and the grounding gate (prd.md §8.3). */

const src = RESUMES.frontend!;
const fe = JD_ANALYSES.fe!;
const identity = (r: Resume): GenerationPlan => ({ summary: r.summary.text, sectionOrder: [], workExperience: [], projects: [], skills: [], gaps: [] });
const ground = (plan: GenerationPlan, source: Resume = src, analysis: JdAnalysis = fe) => {
  const v = assembleVersion(source, plan);
  return checkGrounding({ source, output: v.resume, provenance: v.provenance, terms: { groups: analysis.requirements } });
};
const req = (id: string, type: JdAnalysis["requirements"][number]["type"], keywords: string[], synonyms: string[] = []) => ({ id, text: keywords.join(", "), type, priority: "required" as const, keywords, synonyms });
const jd = (requirements: JdAnalysis["requirements"]): JdAnalysis => ({ jobTitle: "Engineer", seniority: null, minYearsExperience: null, requirements, educationRequirements: [], domainTerms: [] });

/** A fake OpenAI that returns the given plans in order (then repeats the last). */
function sequence(...outputs: unknown[]) {
  let i = 0;
  const create = vi.fn(async () => {
    const out = outputs[Math.min(i++, outputs.length - 1)];
    if (out instanceof Error) throw out;
    if (out && typeof out === "object" && "status" in out) return out;
    return { status: "completed", output: [], output_text: JSON.stringify(out), usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0 } } };
  });
  return { client: { responses: { create } } as unknown as ResponsesClient, create, input: (n: number) => ((create.mock.calls as unknown[][])[n]![0] as { input: { content: string }[] }).input[0]!.content };
}
const gen = (client: ResponsesClient, analysis: JdAnalysis = fe, source: Resume = src) => generateTailoredResume(client, { source, analysis, model: "gpt-5-mini", maxOutputTokens: 6000 });

describe("ungroundedJdTerms (terms the model is told not to use)", () => {
  it("lists JD skills the source lacks, never duty words from responsibilities", () => {
    const a = jd([req("r1", "tool", ["GraphQL"]), req("r2", "responsibility", ["support", "features"]), req("r3", "skill", ["written communication"])]);
    expect(ungroundedJdTerms(src, { groups: a.requirements }).sort()).toEqual(["GraphQL", "written communication"]);
  });

  it("doesn't ban a synonym of something the source has (React.js when the source says React)", () => {
    const a = jd([req("r1", "tool", ["React"], ["React.js", "ReactJS"])]);
    expect(ungroundedJdTerms(src, { groups: a.requirements })).toEqual([]);
  });

  it("is case-insensitive and de-duplicated", () => {
    const a = jd([req("r1", "tool", ["typescript", "GRAPHQL"]), req("r2", "tool", ["GraphQL"])]);
    expect(ungroundedJdTerms(src, { groups: a.requirements })).toEqual(["GRAPHQL"]);
  });

  it("handles a JD with no requirements, and a resume with no content", () => {
    expect(ungroundedJdTerms(src, { groups: [] })).toEqual([]);
    const empty = resumeSchema.parse({ schemaVersion: "2.0" });
    expect(ungroundedJdTerms(empty, { groups: fe.requirements }).length).toBe(fe.requirements.flatMap((r) => [...r.keywords, ...r.synonyms]).length);
  });
});

describe("grounding: duty words vs claims", () => {
  it("everyday words from responsibility lines are not violations", () => {
    const a = jd([...fe.requirements, req("r9", "responsibility", ["support", "features", "review", "shipping"])]);
    const plan = identity(src);
    plan.summary = "Frontend engineer who ships features, supports product teams and reviews code in React and TypeScript.";
    expect(ground(plan, src, a)).toEqual([]);
  });

  it("an experience-type synonym the source lacks (\"user-facing\") is still blocked", () => {
    const a = jd([req("r1", "experience", ["direct interaction with customers"], ["customer-facing", "user-facing"])]);
    const plan = identity(src);
    plan.summary = "Frontend engineer building user-facing React products.";
    expect(ground(plan, src, a).map((v) => [v.rule, v.value])).toEqual([["term_not_in_source", "user-facing"]]);
  });

  it("text copied verbatim from the source is never flagged, even if it contains a JD term", () => {
    const a = jd([req("r1", "skill", ["Mentored"])]);
    const s = structuredClone(src);
    s.summary.text = "Frontend engineer. Mentored two junior engineers.";
    expect(ground(identity(s), s, a)).toEqual([]);
  });
});

describe("grounding: numbers", () => {
  it("years taken from the source's own dates are allowed (\"since 2023\")", () => {
    const plan = identity(src);
    plan.summary = "Frontend engineer at Northwind since 2023, building React and TypeScript products.";
    expect(ground(plan).filter((v) => v.rule === "number_not_in_source")).toEqual([]);
  });

  it("invented years of experience are blocked even when a nearby number exists", () => {
    const plan = identity(src);
    plan.summary = "Frontend engineer with 6 years of experience.";
    expect(ground(plan).map((v) => v.value)).toEqual(["6"]);
  });

  it("number formats normalise: 1,200 = 1200, 38% = 38", () => {
    expect(numbersIn("1,200 readers, 38% faster, 4.5 rating")).toEqual(["1200", "38", "4.5"]);
    const plan = identity(src);
    plan.projects = [{ id: "pr_2", bullets: [{ text: "Recipe blog with 1200 monthly readers.", sourceBulletIds: ["b_7"], changeType: "rewritten" }] }];
    expect(ground(plan).filter((v) => v.rule === "number_not_in_source")).toEqual([]);
  });

  it("a grade's scale (8.4/10) is blocked: numbers match anywhere, so allowing the scale's 10 would also allow \"10 years\"", () => {
    const plan = identity(src);
    plan.summary = "Frontend engineer, B.Tech in Computer Science (CGPA 8.4/10).";
    expect(ground(plan).map((v) => v.value)).toEqual(["10"]);
    plan.summary = "Frontend engineer, B.Tech in Computer Science (CGPA 8.4).";
    expect(ground(plan)).toEqual([]);
  });

  it("a changed metric is blocked (38% → 40%)", () => {
    const plan = identity(src);
    plan.workExperience = [{ id: "we_1", bullets: [{ text: "Cut page load time by 40%.", sourceBulletIds: ["b_2"], changeType: "rewritten" }] }];
    expect(ground(plan).map((v) => [v.rule, v.value])).toContainEqual(["number_not_in_source", "40"]);
  });
});

describe("grounding: structure", () => {
  it("an identity plan is grounded even for a near-empty resume", () => {
    const empty = resumeSchema.parse({ schemaVersion: "2.0", personalInfo: { firstName: "A", lastName: "", headline: "", email: "a@b.co", phone: "", location: "", links: [] } });
    expect(ground(identity(empty), empty)).toEqual([]);
  });

  it("a plan entry for a job id that doesn't exist adds nothing", () => {
    const plan = identity(src);
    plan.workExperience = [{ id: "we_999", bullets: [{ text: "Invented role.", sourceBulletIds: ["b_1"], changeType: "rewritten" }] }];
    const out = assembleVersion(src, plan).resume;
    expect(out.workExperience.map((w) => w.id)).toEqual(src.workExperience.map((w) => w.id));
    expect(JSON.stringify(out)).not.toContain("Invented role");
  });

  it("a bullet credited to another job's source bullet is a provenance violation", () => {
    const plan = identity(src);
    plan.workExperience = [{ id: "we_2", bullets: [{ text: "Built the React and TypeScript design system.", sourceBulletIds: ["b_1"], changeType: "rewritten" }] }];
    expect(ground(plan).some((v) => v.rule.startsWith("provenance"))).toBe(true);
  });

  it("a skill differing only by case is grounded; a new one is not", () => {
    const plan = identity(src);
    plan.skills = [{ category: "Skills", items: ["react", "TYPESCRIPT", "Vue"] }];
    expect(ground(plan).map((v) => [v.rule, v.value])).toEqual([["skill_not_in_source", "Vue"]]);
  });
});

describe("terms: matching boundaries", () => {
  it("doesn't match a term inside another word", () => {
    expect(mentions("Experienced with Golang services", "Go")).toBe(false);
    expect(mentions("Built in Java", "JavaScript")).toBe(false);
    expect(mentions("C# and .NET", "C")).toBe(false);
  });

  it("matches terms with symbols at word edges", () => {
    expect(mentions("Wrote C# services", "C#")).toBe(true);
    expect(mentions("Shipped Next.js apps", "Next.js")).toBe(true);
    expect(mentions("Set up CI/CD.", "CI/CD")).toBe(true);
  });

  it("an empty or whitespace term never matches", () => {
    expect(mentions("anything", "")).toBe(false);
    expect(mentions("anything", "   ")).toBe(false);
  });
});

describe("generateTailoredResume: the AI round trip", () => {
  it("tells the model up front which JD terms not to use", async () => {
    const s = sequence(identity(src));
    await gen(s.client);
    expect(s.input(0)).toContain('Do not use any of them');
    expect(s.input(0)).toContain('"GraphQL"');
  });

  it("says nothing about banned terms when every JD term is supported", async () => {
    const s = sequence(identity(src));
    await gen(s.client, jd([req("r1", "tool", ["React"])]));
    expect(s.input(0)).not.toContain("Do not use any of them");
  });

  it("the retry prompt lists the exact offending words and numbers", async () => {
    const bad = identity(src);
    bad.summary = "Frontend engineer with GraphQL and 9 years of experience.";
    const s = sequence(bad, identity(src));
    const r = await gen(s.client);
    expect(r.attempts).toBe(2);
    expect(s.input(1)).toMatch(/Remove these exact words\/numbers everywhere they appear: .*"GraphQL".*"9"/);
  });

  it("an output cut off by the token budget fails at once — no retry, no partial resume", async () => {
    const s = sequence({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], output_text: "{" });
    await expect(gen(s.client)).rejects.toMatchObject({ kind: "incomplete" });
    expect(s.create).toHaveBeenCalledTimes(1);
  });

  it("a malformed plan then a good one: saved on attempt 2", async () => {
    const s = sequence({ nonsense: true }, identity(src));
    const r = await gen(s.client);
    expect(r.attempts).toBe(2);
  });

  it("a malformed plan twice: fails as invalid output, never returns a resume", async () => {
    const s = sequence({ nonsense: true });
    const e = await gen(s.client).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(StructuringError);
    expect(e).toMatchObject({ kind: "invalid_output" });
    expect(s.create).toHaveBeenCalledTimes(2);
  });

  it("grounding fails twice: GroundingFailedError carries the violations and the usage of both attempts", async () => {
    const bad = identity(src);
    bad.summary = "Frontend engineer with 12 years of experience.";
    const s = sequence(bad);
    const e = (await gen(s.client).catch((x: unknown) => x)) as GroundingFailedError;
    expect(e).toBeInstanceOf(GroundingFailedError);
    expect(e.violations.map((v) => v.value)).toContain("12");
    expect(e.usage).toMatchObject({ inputTokens: 200, outputTokens: 100 });
  });

  it("an API error on the retry propagates (the hold is released by the caller)", async () => {
    const bad = identity(src);
    bad.summary = "Frontend engineer with GraphQL.";
    const s = sequence(bad, Object.assign(new Error("Request timed out."), {}));
    await expect(gen(s.client)).rejects.toMatchObject({ kind: "api_error" });
  });

  it("a plan that tries to change personal info or dates can't: those always come from the source", async () => {
    const plan = { ...identity(src), personalInfo: { firstName: "Hacker" }, workExperience: [{ id: "we_1", company: "Google", startDate: "2015", bullets: [] }] };
    const s = sequence(plan);
    const r = await gen(s.client);
    expect(r.resume.personalInfo).toEqual(src.personalInfo);
    expect(r.resume.workExperience[0]).toMatchObject({ company: "Northwind", startDate: src.workExperience[0]!.startDate });
  });
});
