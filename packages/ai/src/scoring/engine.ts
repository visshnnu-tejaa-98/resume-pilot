import type { JdAnalysis, JdRequirement } from "@resume-pilot/validators";
import type { Resume } from "@resume-pilot/validators/resume";
import { mentions, termKey } from "../generation/terms";
import type { MatchStatus, ScoringEvaluation } from "./schema";

/**
 * Deterministic ATS scoring (prd.md §9.1 steps 2–3). Pure functions: the
 * same resume + analysis + AI judgement + `asOf` always give the same
 * report, which is what makes a cached report reproducible (16.2.6).
 *
 * The AI's judgement is *checked*, not trusted: evidence ids that don't
 * exist in the resume are dropped, and a "matched"/"partial" with no
 * surviving evidence counts as missing.
 */

export const SCORING_METHOD_VERSION = "ats-v1";
export const SCORE_DISCLAIMER = "Estimated compatibility score. Employers' ATS systems differ; this is not a guarantee.";

export const DIMENSIONS = [
  { key: "keywords", label: "Required keywords", weightPct: 30 },
  { key: "skills", label: "Skills match", weightPct: 25 },
  { key: "experience", label: "Experience relevance", weightPct: 20 },
  { key: "education", label: "Education and qualifications", weightPct: 10 },
  { key: "structure", label: "Structure and formatting", weightPct: 15 },
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

/** The resume as an employer would see it: hidden sections and items removed. */
export function visibleResume(r: Resume): Resume {
  const hiddenItems = new Set(r.layout.hiddenItems);
  const hiddenSections = new Set<string>(r.layout.hiddenSections);
  const keep = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !hiddenItems.has(x.id));
  const out = structuredClone(r);
  out.summary = hiddenSections.has("summary") ? { text: "" } : out.summary;
  out.workExperience = hiddenSections.has("workExperience") ? [] : keep(out.workExperience).map((w) => ({ ...w, bullets: keep(w.bullets) }));
  out.projects = hiddenSections.has("projects") ? [] : keep(out.projects).map((p) => ({ ...p, bullets: keep(p.bullets) }));
  out.education = hiddenSections.has("education") ? [] : keep(out.education);
  out.certifications = hiddenSections.has("certifications") ? [] : keep(out.certifications);
  out.skills = hiddenSections.has("skills") ? [] : out.skills.map((g) => ({ ...g, items: keep(g.items) }));
  out.customSections = out.customSections.filter((c) => !hiddenSections.has(`custom:${c.id}` as never)).map((c) => ({ ...c, items: keep(c.items) }));
  return out;
}

/** Item id → the line a reader would see (evidence links in the report). */
export function resumeLines(r: Resume): Record<string, string> {
  const lines: Record<string, string> = {};
  if (r.summary.text) lines.summary = r.summary.text;
  for (const w of r.workExperience) {
    lines[w.id] = [w.designation, w.company].filter(Boolean).join(" · ");
    for (const b of w.bullets) lines[b.id] = b.text;
  }
  for (const p of r.projects) {
    lines[p.id] = p.name;
    for (const b of p.bullets) lines[b.id] = b.text;
  }
  for (const e of r.education) {
    lines[e.id] = [[e.degree, e.fieldOfStudy].filter(Boolean).join(", "), e.institution].filter(Boolean).join(" · ");
    for (const b of e.bullets) lines[b.id] = b.text;
  }
  for (const g of r.skills) for (const i of g.items) lines[i.id] = i.name;
  for (const c of r.certifications) lines[c.id] = [c.name, c.issuer].filter(Boolean).join(" · ");
  for (const c of r.customSections) for (const i of c.items) {
    lines[i.id] = [i.heading, i.subheading].filter(Boolean).join(" · ");
    for (const b of i.bullets) lines[b.id] = b.text;
  }
  return lines;
}

export interface KeywordHit {
  requirementId: string;
  found: string[];
  missing: string[];
  /** Item ids whose line contains a found keyword. */
  lineIds: string[];
}

/** Deterministic keyword presence (exact + synonyms) per requirement. */
export function keywordHits(r: Resume, analysis: Pick<JdAnalysis, "requirements">): KeywordHit[] {
  const lines = resumeLines(r);
  const skillKeys = new Set(r.skills.flatMap((g) => g.items.map((i) => termKey(i.name))));
  return analysis.requirements.map((req) => {
    const variants = [...req.keywords, ...req.synonyms];
    const found: string[] = [];
    const missing: string[] = [];
    const lineIds = new Set<string>();
    for (const kw of req.keywords) {
      const group = [kw, ...req.synonyms];
      const ids = Object.entries(lines)
        .filter(([, text]) => group.some((v) => mentions(text, v)))
        .map(([id]) => id);
      const inSkills = group.some((v) => skillKeys.has(termKey(v)));
      if (ids.length || inSkills) {
        found.push(kw);
        ids.forEach((id) => lineIds.add(id));
      } else missing.push(kw);
    }
    // A requirement with no keywords is judged by the AI alone.
    if (req.keywords.length === 0 && variants.length === 0) return { requirementId: req.id, found: [], missing: [], lineIds: [] };
    return { requirementId: req.id, found, missing, lineIds: [...lineIds] };
  });
}

export interface StructureCheck {
  id: "name" | "contact" | "headings" | "dates" | "bullet_length" | "page_count";
  label: string;
  passed: boolean;
  detail: string;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Formatting checks an ATS cares about (§9.1 step 2). */
export function structureChecks(r: Resume): StructureCheck[] {
  const p = r.personalInfo;
  const dated = [...r.workExperience, ...r.education];
  const undated = dated.filter((x) => !x.startDate.value && !x.endDate.value && !("isCurrent" in x && x.isCurrent));
  const bullets = [...r.workExperience, ...r.projects].flatMap((x) => x.bullets);
  const longOrShort = bullets.filter((b) => words(b.text) > 40 || words(b.text) < 4);
  const allText = [r.summary.text, ...bullets.map((b) => b.text), ...r.skills.flatMap((g) => g.items.map((i) => i.name))].join(" ");
  // ~550 words fit an A4 page in these templates.
  const pages = Math.max(1, Math.ceil(words(allText) / 550));
  const headings = [r.workExperience.length > 0, r.education.length > 0, r.skills.some((g) => g.items.length > 0)];
  return [
    { id: "name", label: "Name present", passed: !!(p.firstName || p.lastName), detail: p.firstName || p.lastName ? "Found" : "Add your name" },
    { id: "contact", label: "Contact details", passed: !!p.email && !!(p.phone || p.location), detail: p.email ? (p.phone || p.location ? "Email and phone/location found" : "Add a phone number or location") : "Add an email address" },
    { id: "headings", label: "Standard sections", passed: headings.every(Boolean), detail: headings.every(Boolean) ? "Experience, education and skills found" : "Use standard Experience, Education and Skills sections" },
    { id: "dates", label: "Dates readable", passed: undated.length === 0, detail: undated.length ? `${undated.length} entr${undated.length === 1 ? "y has" : "ies have"} no readable dates` : "All dates readable" },
    { id: "bullet_length", label: "Bullet length", passed: bullets.length > 0 && longOrShort.length <= Math.floor(bullets.length / 5), detail: longOrShort.length ? `${longOrShort.length} bullet${longOrShort.length === 1 ? " is" : "s are"} very long or very short` : "Bullets are a readable length" },
    { id: "page_count", label: "Length", passed: pages <= 2, detail: `About ${pages} page${pages === 1 ? "" : "s"}` },
  ];
}

const monthIndex = (v: string) => {
  const [y, m] = v.split("-");
  return Number(y) * 12 + (m ? Number(m) - 1 : 0);
};

/** Total years of work, overlapping roles counted once; current roles run to `asOf`. */
export function candidateYears(r: Resume, asOf: Date): number {
  const now = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  const spans = r.workExperience
    .filter((w) => w.startDate.value)
    .map((w) => [monthIndex(w.startDate.value!), w.isCurrent || !w.endDate.value ? now : monthIndex(w.endDate.value)] as const)
    .filter(([a, b]) => b >= a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [a, b] of spans) {
    if (a > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else curEnd = Math.max(curEnd, b);
  }
  if (curEnd >= 0) total += curEnd - curStart;
  return Math.round((total / 12) * 10) / 10;
}

export interface RequirementResult {
  id: string;
  text: string;
  type: JdRequirement["type"];
  priority: JdRequirement["priority"];
  keywords: string[];
  status: MatchStatus;
  reason: string;
  /** Validated evidence: item id + the line it points at. */
  evidence: { id: string; line: string }[];
  keywordsFound: string[];
  keywordsMissing: string[];
}

export interface ScoreResult {
  overall: number;
  band: "Strong match" | "Good match" | "Needs work";
  dimensions: { key: DimensionKey; label: string; weightPct: number; points: number; max: number }[];
  requirements: RequirementResult[];
  checks: StructureCheck[];
  years: number;
  minYears: number | null;
}

const VALUE: Record<MatchStatus, number> = { matched: 1, partial: 0.5, missing: 0 };

/** Weighted ratio: required = 1, preferred = 0.5 (§9.1 table). `null` when nothing applies. */
function weighted(reqs: RequirementResult[]): number | null {
  if (!reqs.length) return null;
  let num = 0;
  let den = 0;
  for (const r of reqs) {
    const w = r.priority === "required" ? 1 : 0.5;
    num += w * VALUE[r.status];
    den += w;
  }
  return den ? num / den : null;
}

export function computeScore(input: { resume: Resume; analysis: JdAnalysis; evaluation: ScoringEvaluation; asOf: Date }): ScoreResult {
  const resume = visibleResume(input.resume);
  const lines = resumeLines(resume);
  const hits = new Map(keywordHits(resume, input.analysis).map((h) => [h.requirementId, h]));
  const judged = new Map(input.evaluation.requirements.map((e) => [e.requirementId, e]));

  const requirements: RequirementResult[] = input.analysis.requirements.map((req) => {
    const e = judged.get(req.id);
    const evidence = (e?.evidenceIds ?? []).filter((id, i, a) => a.indexOf(id) === i && lines[id] !== undefined).map((id) => ({ id, line: lines[id]! }));
    // Evidence the model cites must exist; otherwise the claim doesn't count.
    const status: MatchStatus = !e ? "missing" : e.status !== "missing" && evidence.length === 0 ? "missing" : e.status;
    const hit = hits.get(req.id);
    return {
      id: req.id,
      text: req.text,
      type: req.type,
      priority: req.priority,
      keywords: req.keywords,
      status,
      reason: e?.reason ?? "Not assessed",
      evidence,
      keywordsFound: hit?.found ?? [],
      keywordsMissing: hit?.missing ?? req.keywords,
    };
  });

  // 30%: required requirements whose keywords appear (deterministic).
  const required = requirements.filter((r) => r.priority === "required" && r.keywords.length);
  const keywordRatio = required.length ? required.filter((r) => r.keywordsFound.length > 0).length / required.length : 1;
  // 25%: skills/tools, AI status, preferred at half weight.
  const skillRatio = weighted(requirements.filter((r) => r.type === "skill" || r.type === "tool")) ?? 1;
  // 20%: experience/responsibility requirements + years vs minimum.
  const years = candidateYears(resume, input.asOf);
  const minYears = input.analysis.minYearsExperience;
  const expReq = weighted(requirements.filter((r) => r.type === "experience" || r.type === "responsibility"));
  const yearsFactor = minYears ? Math.min(1, years / minYears) : null;
  const expRatio = expReq !== null && yearsFactor !== null ? 0.7 * expReq + 0.3 * yearsFactor : (expReq ?? yearsFactor ?? 1);
  // 10%: education / qualifications.
  const eduRatio = weighted(requirements.filter((r) => r.type === "education" || r.type === "qualification")) ?? 1;
  // 15%: deterministic structure checks.
  const checks = structureChecks(resume);
  const structureRatio = checks.filter((c) => c.passed).length / checks.length;

  const ratios: Record<DimensionKey, number> = { keywords: keywordRatio, skills: skillRatio, experience: expRatio, education: eduRatio, structure: structureRatio };
  const dimensions = DIMENSIONS.map((d) => ({ key: d.key, label: d.label, weightPct: d.weightPct, max: d.weightPct, points: Math.round(Math.max(0, Math.min(1, ratios[d.key])) * d.weightPct) }));
  const overall = dimensions.reduce((n, d) => n + d.points, 0);
  const band = overall >= 75 ? "Strong match" : overall >= 55 ? "Good match" : "Needs work";
  return { overall, band, dimensions, requirements, checks, years, minYears };
}
