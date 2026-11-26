import OpenAI from "openai";
import type { JdAnalysis } from "@resume-pilot/validators";
import type { Resume } from "@resume-pilot/validators/resume";
import type { ResponsesClient } from "./responses";
import { createOpenAIClient } from "./structure";

/**
 * Local-only stand-in for OpenAI (no key, an invalid key, or AI_MOCK=1
 * outside production — see resolveAIClient). It answers the four
 * structured-output calls the app makes with plausible, schema-valid JSON
 * built from the request's own data, so uploads, JD analysis, generation,
 * ATS scoring, holds/captures and reports all run end to end for free.
 *
 * Deterministic logic, not AI: generation keeps the source wording (it
 * only reorders bullets by JD relevance), so it always passes grounding.
 */

/** Common skills/tools recognised in JD and resume text. */
const TERMS = [
  "JavaScript", "TypeScript", "React", "React Native", "Next.js", "Node.js", "Express", "Vue", "Angular", "Svelte", "HTML", "CSS", "Tailwind",
  "Redux", "GraphQL", "REST", "gRPC", "Python", "Django", "Flask", "FastAPI", "Java", "Spring", "Kotlin", "Swift", "Go", "Golang", "Rust", "C#", ".NET",
  "Ruby", "Rails", "PHP", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Elasticsearch", "AWS", "GCP", "Azure", "Docker",
  "Kubernetes", "Terraform", "CI/CD", "GitHub Actions", "Jenkins", "Linux", "Git", "Jest", "Playwright", "Cypress", "Figma", "Tableau", "Power BI",
  "Excel", "pandas", "PyTorch", "TensorFlow", "Machine Learning", "Microservices", "Agile", "Scrum", "Design systems", "Accessibility",
];

const tagged = (input: string, tag: string): string | null => {
  const m = input.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`));
  return m ? m[1]! : null;
};
const has = (text: string, term: string) => new RegExp(`(^|[^A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(text);
const termsIn = (text: string) => TERMS.filter((t) => has(text, t));
/** Small stable hash so the same input gives the same "random" choices. */
const seed = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function analyseJd(text: string) {
  const lines = text.split("\n").map((l) => l.replace(/^[\s\-*•·]+/, "").trim()).filter(Boolean);
  const title = lines[0]?.split(/[—–|(]/)[0]?.trim().slice(0, 120) || null;
  const years = text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  const preferredLine = (t: string) => lines.find((l) => has(l, t) && /prefer|nice to have|bonus|plus/i.test(l));
  const requirements: Omit<JdAnalysis["requirements"][number], "id">[] = termsIn(text).slice(0, 12).map((t) => ({
    text: `Experience with ${t}`,
    type: "tool",
    priority: preferredLine(t) ? "preferred" : "required",
    keywords: [t],
    synonyms: [],
  }));
  // A couple of duty lines so the report has responsibilities too.
  for (const l of lines.slice(1).filter((l) => /^(build|design|own|work|develop|lead|ship|maintain|collaborate)/i.test(l)).slice(0, 3)) {
    requirements.push({ text: l.slice(0, 200), type: "responsibility", priority: "required", keywords: [], synonyms: [] });
  }
  return {
    jobTitle: title,
    seniority: /senior|sr\.?\b/i.test(text) ? "Senior" : /lead|principal/i.test(text) ? "Lead" : /junior|intern/i.test(text) ? "Junior" : null,
    minYearsExperience: years ? Number(years[1]) : null,
    requirements,
    educationRequirements: /degree|b\.?tech|bachelor/i.test(text) ? ["Bachelor's degree in Computer Science or related field"] : [],
    domainTerms: [],
  };
}

function resumeText(r: Resume) {
  return [r.summary.text, ...r.workExperience.flatMap((w) => [w.designation, ...w.bullets.map((b) => b.text), ...w.skillsUsed]), ...r.projects.flatMap((p) => [p.name, ...p.bullets.map((b) => b.text), ...p.technologies]), ...r.skills.flatMap((g) => g.items.map((i) => i.name))].join("\n");
}

function tailoringPlan(source: Resume, analysis: JdAnalysis) {
  const keywords = analysis.requirements.filter((r) => r.type !== "responsibility").flatMap((r) => [...r.keywords, ...r.synonyms]);
  const score = (t: string) => keywords.filter((k) => has(t, k)).length;
  // Source wording, most JD-relevant bullets first: always grounded.
  const order = <B extends { id: string; text: string }>(bs: B[]) =>
    bs.map((b, i) => ({ b, i, s: score(b.text) })).sort((x, y) => y.s - x.s || x.i - y.i).map(({ b, i }, j) => ({ text: b.text, sourceBulletIds: [b.id], changeType: i === j ? ("unchanged" as const) : ("reordered" as const) }));
  const text = resumeText(source);
  return {
    summary: source.summary.text,
    sectionOrder: [],
    workExperience: source.workExperience.map((w) => ({ id: w.id, bullets: order(w.bullets) })),
    projects: source.projects.map((p) => ({ id: p.id, bullets: order(p.bullets) })),
    skills: source.skills.map((g) => ({ category: g.category, items: [...g.items].sort((a, b) => score(b.name) - score(a.name)).map((i) => i.name) })),
    gaps: analysis.requirements
      .filter((r) => r.type !== "responsibility" && r.keywords.length && !r.keywords.some((k) => has(text, k)))
      .map((r) => ({ requirementId: r.id, keyword: r.keywords[0]!, note: "Not found in your resume" })),
  };
}

function evaluation(resume: Resume, analysis: JdAnalysis) {
  const items: { id: string; text: string }[] = [
    ...(resume.summary.text ? [{ id: "summary", text: resume.summary.text }] : []),
    ...resume.workExperience.flatMap((w) => w.bullets),
    ...resume.projects.flatMap((p) => p.bullets),
    ...resume.skills.flatMap((g) => g.items.map((i) => ({ id: i.id, text: i.name }))),
  ];
  const requirements = analysis.requirements.map((r) => {
    const terms = [...r.keywords, ...r.synonyms];
    const hits = terms.length ? items.filter((it) => terms.some((t) => has(it.text, t))) : items.filter((it) => seed(it.id + r.id) % 5 === 0);
    const status = hits.length >= 2 ? ("matched" as const) : hits.length === 1 ? ("partial" as const) : ("missing" as const);
    return {
      requirementId: r.id,
      status,
      evidenceIds: hits.slice(0, 3).map((h) => h.id),
      reason: status === "missing" ? `No mention of ${r.keywords[0] ?? "this"} in the resume.` : `Mentioned in ${hits.length} place${hits.length === 1 ? "" : "s"}.`,
    };
  });
  const missing = requirements.filter((r) => r.status === "missing").length;
  return {
    requirements,
    assessment: `[Mock AI] Matches ${requirements.length - missing} of ${requirements.length} requirements. This is sample output for local development, not a real evaluation.`,
    recommendations: [
      { area: "summary" as const, title: "Lead with the role's core skills", detail: "Open the summary with the two or three skills the job asks for most." },
      { area: "bullets" as const, title: "Quantify impact", detail: "Where your resume already has numbers, put them early in the bullet." },
      ...(missing ? [{ area: "content" as const, title: `Address ${missing} missing requirement${missing === 1 ? "" : "s"}`, detail: "Add them only if you genuinely have the experience." }] : []),
    ],
  };
}

function extractResume(raw: string) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const [first = "Sample", ...rest] = (lines[0] ?? "Sample Candidate").split(/\s+/);
  const bullets = lines.filter((l) => /^[-•*·]/.test(l)).map((l) => ({ text: l.replace(/^[-•*·]\s*/, "").slice(0, 300), kind: "responsibility" }));
  const skills = termsIn(raw);
  return {
    personalInfo: {
      firstName: first,
      lastName: rest.join(" "),
      headline: "",
      email: raw.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "",
      phone: raw.match(/\+?\d[\d\s-]{8,}\d/)?.[0] ?? "",
      location: "",
      links: [],
    },
    summary: { text: lines.slice(1, 4).join(" ").slice(0, 600) },
    workExperience: [{ company: "Sample Company (mock extraction)", designation: "Your role", location: "", startDate: { value: null, raw: "" }, endDate: { value: null, raw: "Present" }, isCurrent: true, bullets: bullets.slice(0, 8), skillsUsed: [] }],
    education: [],
    skills: skills.length ? [{ category: "Skills", items: skills.map((name) => ({ name })) }] : [],
    projects: [],
    certifications: [],
    customSections: [],
  };
}

export class MockResponsesClient implements ResponsesClient {
  readonly mock = true;
  /** Simulated response time; 0 in tests. */
  constructor(private readonly latency: (input: string) => number = (input) => 400 + (seed(input) % 800)) {}
  responses = {
    create: async (params: OpenAI.Responses.ResponseCreateParamsNonStreaming): Promise<OpenAI.Responses.Response> => {
      const input = Array.isArray(params.input) ? params.input.map((m) => ("content" in m && typeof m.content === "string" ? m.content : "")).join("\n") : String(params.input ?? "");
      const format = (params.text?.format as { name?: string } | undefined)?.name;
      const json = (tag: string) => JSON.parse(tagged(input, tag) ?? "null");
      let out: unknown;
      if (format === "jd_analysis") out = analyseJd(tagged(input, "job_description") ?? input);
      else if (format === "tailoring_plan") out = tailoringPlan(json("source_resume") as Resume, json("job_analysis") as JdAnalysis);
      else if (format === "ats_evaluation") out = evaluation(json("resume") as Resume, json("job_analysis") as JdAnalysis);
      else if (format === "resume") out = extractResume(tagged(input, "resume_text") ?? input);
      else throw new Error(`Mock AI: no handler for response format "${format}"`);

      const text = JSON.stringify(out);
      const wait = this.latency(input);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // Rough token counts (~4 chars/token) so holds and captures behave like real calls.
      const inputTokens = Math.ceil(((params.instructions?.length ?? 0) + input.length) / 4);
      const outputTokens = Math.min(params.max_output_tokens ?? Infinity, Math.ceil(text.length / 4));
      return {
        status: "completed",
        output: [],
        output_text: text,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
      } as unknown as OpenAI.Responses.Response;
    },
  };
}

export type AIClientMode = "openai" | "mock";

/**
 * Real OpenAI when OPENAI_API_KEY is set and accepted; otherwise, outside
 * production only, the mock. AI_MOCK=1 forces the mock locally even with a
 * valid key. In production a missing or rejected key is an error — the
 * mock is never used there.
 */
export async function resolveAIClient(env: NodeJS.ProcessEnv = process.env): Promise<{ client: ResponsesClient; mode: AIClientMode; reason: string }> {
  const prod = env.NODE_ENV === "production" || env.APP_ENV === "production";
  const mock = (reason: string) => {
    if (prod) throw new Error(`OpenAI unavailable in production: ${reason}`);
    return { client: new MockResponsesClient(), mode: "mock" as const, reason };
  };
  if (env.AI_MOCK === "1") return mock("AI_MOCK=1");
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return mock("OPENAI_API_KEY is not set");
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) return mock("OPENAI_API_KEY doesn't look like an OpenAI key");

  // Listing models is free (no tokens), so it's a cheap validity check.
  const client = createOpenAIClient(env);
  try {
    await client.models.list({ timeout: 10_000, maxRetries: 0 });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return mock(`OPENAI_API_KEY was rejected (HTTP ${status})`);
    // Network trouble: don't silently switch to fake data; let real calls fail and retry.
  }
  return { client, mode: "openai", reason: "OPENAI_API_KEY accepted" };
}
