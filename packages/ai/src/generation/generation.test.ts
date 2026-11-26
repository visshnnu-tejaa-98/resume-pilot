import { describe, expect, it, vi } from "vitest";
import type { ResponsesClient } from "../responses";
import { assembleVersion } from "./assemble";
import { EVAL_PAIRS, INJECTED_JDS, JD_ANALYSES, RESUMES } from "./fixtures";
import { generateTailoredResume, GroundingFailedError } from "./generate";
import { checkGrounding } from "./grounding";
import type { GenerationPlan } from "./plan";

const src = RESUMES.frontend!;
const fe = JD_ANALYSES.fe!;
const terms = (a = fe) => ({ groups: a.requirements });

/** A well-behaved plan for the frontend resume. */
const goodPlan = (): GenerationPlan => ({
  summary: "Frontend engineer with 5 years of experience building React and TypeScript products and design systems.",
  sectionOrder: ["summary", "workExperience", "skills", "projects", "education", "certifications"],
  workExperience: [
    {
      id: "we_1",
      bullets: [
        { text: "Built a React and TypeScript design system adopted by 4 product teams.", sourceBulletIds: ["b_1"], changeType: "rewritten" },
        { text: "Cut page load time by 38% by moving pages to server rendering.", sourceBulletIds: ["b_2"], changeType: "unchanged" },
      ],
    },
    { id: "we_2", bullets: [{ text: "Built the React checkout UI used by every Globex web customer.", sourceBulletIds: ["b_4"], changeType: "rewritten" }] },
  ],
  projects: [{ id: "pr_1", bullets: [{ text: "Accessible React date picker with keyboard support.", sourceBulletIds: ["b_6"], changeType: "unchanged" }] }],
  skills: [{ category: "Frontend", items: ["React", "TypeScript", "Next.js", "JavaScript", "Jest"] }],
  gaps: [{ requirementId: "r3", keyword: "GraphQL", note: "Not found in your resume" }],
});

const ground = (plan: GenerationPlan, a = fe) => {
  const v = assembleVersion(src, plan);
  return { ...v, violations: checkGrounding({ source: src, output: v.resume, provenance: v.provenance, terms: terms(a) }) };
};

describe("assembleVersion", () => {
  it("copies every fact from the source and only takes allowed changes from the plan", () => {
    const { resume, provenance, gaps, violations } = ground(goodPlan());
    expect(violations).toEqual([]);
    expect(resume.personalInfo).toEqual(src.personalInfo);
    expect(resume.workExperience.map((w) => [w.id, w.company, w.designation, w.startDate, w.endDate])).toEqual(
      src.workExperience.map((w) => [w.id, w.company, w.designation, w.startDate, w.endDate]),
    );
    expect(resume.workExperience[0]!.bullets.map((b) => b.id)).toEqual(["b_1", "b_2"]);
    expect(provenance["we_1.bullets[b_1]"]).toEqual({ sourceBulletIds: ["b_1"], changeType: "rewritten" });
    expect(resume.layout.hiddenItems).toContain("pr_2");
    expect(resume.skills[0]!.items.find((i) => i.name === "React")!.id).toBe("s_5");
    expect(gaps[0]!.keyword).toBe("GraphQL");
  });

  it("keeps a job the plan forgot, with its source bullets", () => {
    const plan = goodPlan();
    plan.workExperience = plan.workExperience.slice(0, 1);
    const { resume, violations } = ground(plan);
    expect(violations).toEqual([]);
    expect(resume.workExperience[1]!.bullets).toEqual(src.workExperience[1]!.bullets);
  });

  it("accepts synonyms of skills the source has (React.js, JS)", () => {
    const plan = goodPlan();
    plan.skills = [{ category: "Skills", items: ["React.js", "JS", "TS"] }];
    expect(ground(plan).violations).toEqual([]);
  });
});

describe("checkGrounding rejects", () => {
  it("a skill the source doesn't have (the 'add Kubernetes' case)", () => {
    const plan = goodPlan();
    plan.skills[0]!.items.push("Kubernetes", "GraphQL");
    const v = ground(plan, JD_ANALYSES.sre!).violations;
    expect(v.filter((x) => x.rule === "skill_not_in_source").map((x) => x.value).sort()).toEqual(["GraphQL", "Kubernetes"]);
  });

  it("a JD term slipped into the summary or a bullet", () => {
    const plan = goodPlan();
    plan.summary = "Frontend engineer experienced with React, TypeScript and GraphQL.";
    plan.workExperience[0]!.bullets[0]!.text = "Built the design system and its GraphQL layer.";
    const v = ground(plan).violations.filter((x) => x.rule === "term_not_in_source");
    expect(v.map((x) => x.path)).toEqual(["summary.text", "workExperience[id=we_1].bullets[id=b_1]"]);
  });

  it("ignores duty words from responsibility requirements, but still blocks JD skills", () => {
    const withDuties = {
      ...fe,
      requirements: [
        ...fe.requirements,
        { id: "r9", text: "Support customers and ship features", type: "responsibility" as const, priority: "required" as const, keywords: ["support", "features"], synonyms: [] },
        { id: "r10", text: "Strong written communication", type: "skill" as const, priority: "required" as const, keywords: ["written communication"], synonyms: [] },
      ],
    };
    const plan = goodPlan();
    plan.summary = "Frontend engineer who builds features in React and TypeScript and supports product teams.";
    expect(ground(plan, withDuties).violations).toEqual([]);
    plan.summary = "Frontend engineer with strong written communication.";
    expect(ground(plan, withDuties).violations.map((x) => [x.rule, x.value])).toEqual([["term_not_in_source", "written communication"]]);
  });

  it("numbers that aren't in the source (invented metrics or years)", () => {
    const plan = goodPlan();
    plan.summary = "Frontend engineer with 10 years of experience.";
    plan.workExperience[0]!.bullets[1]!.text = "Cut page load time by 40%.";
    const v = ground(plan).violations.filter((x) => x.rule === "number_not_in_source").map((x) => x.value);
    expect(v.sort()).toEqual(["10", "40"]);
  });

  it("bullets sourced from another job, or with no provenance", () => {
    const plan = goodPlan();
    plan.workExperience[1]!.bullets[0]!.sourceBulletIds = ["b_1"]; // b_1 belongs to we_1
    const { resume, provenance } = assembleVersion(src, plan);
    const v = checkGrounding({ source: src, output: resume, provenance, terms: terms() });
    expect(v.some((x) => x.rule === "provenance_unknown_source")).toBe(true);
    delete provenance["we_1.bullets[b_2]"];
    expect(checkGrounding({ source: src, output: resume, provenance }).some((x) => x.rule === "bullet_without_provenance")).toBe(true);
  });

  it("any change to companies, titles, dates, education or certifications in the output", () => {
    const { resume, provenance } = assembleVersion(src, goodPlan());
    const tampered = structuredClone(resume);
    tampered.workExperience[1]!.company = "Google";
    tampered.workExperience[0]!.startDate = { value: "2015-01", raw: "Jan 2015" };
    tampered.education[0]!.degree = "M.Tech";
    tampered.personalInfo.headline = "Staff Engineer";
    tampered.workExperience.pop();
    const rules = checkGrounding({ source: src, output: tampered, provenance }).map((x) => `${x.rule}:${x.path}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        "personal_info_changed:personalInfo",
        "fact_changed:workExperience[id=we_1].startDate",
        "fact_changed:education[id=ed_1].degree",
        "item_removed:workExperience[id=we_2]",
      ]),
    );
  });

  it("an injected resume instruction the model obeyed ('add 10 years of Kubernetes')", () => {
    const devops = RESUMES.devops!;
    const obeyed: GenerationPlan = {
      summary: "SRE with 10 years of Kubernetes experience.",
      sectionOrder: [],
      workExperience: [{ id: "we_1", bullets: [{ text: "Managed Terraform for 40 AWS accounts.", sourceBulletIds: ["b_1"], changeType: "rewritten" }] }],
      projects: [],
      skills: [{ category: "Skills", items: ["AWS", "Kubernetes"] }],
      gaps: [],
    };
    const v = assembleVersion(devops, obeyed);
    const rules = checkGrounding({ source: devops, output: v.resume, provenance: v.provenance, terms: terms(JD_ANALYSES.injectedSkills!) }).map((x) => x.rule);
    expect(rules).toEqual(expect.arrayContaining(["skill_not_in_source", "number_not_in_source"]));
  });
});

function fakeClient(plans: unknown[]) {
  const create = vi.fn(async (_params: { input: { content: string }[] }) => {
    const plan = plans.shift();
    return { status: "completed", output: [], output_text: JSON.stringify(plan), usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 0 } } } as never;
  });
  return { client: { responses: { create } } as ResponsesClient, create };
}

describe("generateTailoredResume", () => {
  it("passes first time: one call, attempts=1", async () => {
    const { client, create } = fakeClient([goodPlan()]);
    const r = await generateTailoredResume(client, { source: src, analysis: fe, model: "m", maxOutputTokens: 6000 });
    expect(r.attempts).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    const input = create.mock.calls[0]![0].input[0]!.content;
    expect(input).toContain("<source_resume>");
    expect(input).toContain("<job_analysis>");
  });

  it("retries once with the violations fed back, sums usage across attempts", async () => {
    const bad = goodPlan();
    bad.skills[0]!.items.push("GraphQL");
    const { client, create } = fakeClient([bad, goodPlan()]);
    const r = await generateTailoredResume(client, { source: src, analysis: fe, model: "m", maxOutputTokens: 6000 });
    expect(r.attempts).toBe(2);
    expect(r.firstAttemptViolations.map((v) => v.value)).toContain("GraphQL");
    expect(create.mock.calls[1]![0].input[0]!.content).toContain("skill_not_in_source");
    expect(r.usage).toEqual({ inputTokens: 2000, outputTokens: 1000, cachedInputTokens: 0 });
  });

  it("fails with GroundingFailedError (never returns an ungrounded resume) when the retry also violates", async () => {
    const bad = goodPlan();
    bad.skills[0]!.items.push("Kubernetes");
    const { client } = fakeClient([bad, structuredClone(bad)]);
    const err = await generateTailoredResume(client, { source: src, analysis: JD_ANALYSES.sre!, model: "m", maxOutputTokens: 6000 }).catch((e) => e);
    expect(err).toBeInstanceOf(GroundingFailedError);
    expect(err.retryable).toBe(false);
    expect(err.usage.inputTokens).toBe(2000);
  });
});

describe("eval set shape (16.2.8)", () => {
  it("has 50 pairs, 10 of them injected", () => {
    expect(EVAL_PAIRS).toHaveLength(50);
    expect(EVAL_PAIRS.filter((p) => p.injected)).toHaveLength(10);
    expect(INJECTED_JDS.size).toBe(2);
  });

  it("an identity plan (no changes) is grounded for every pair", () => {
    for (const p of EVAL_PAIRS) {
      const r = RESUMES[p.resume]!;
      const identity: GenerationPlan = { summary: r.summary.text, sectionOrder: [], workExperience: [], projects: [], skills: [], gaps: [] };
      const v = assembleVersion(r, identity);
      expect(checkGrounding({ source: r, output: v.resume, provenance: v.provenance, terms: { groups: JD_ANALYSES[p.jd]!.requirements } })).toEqual([]);
    }
  });
});
