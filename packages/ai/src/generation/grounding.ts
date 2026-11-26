import type { Provenance, Resume } from "@resume-pilot/validators/resume";
import { equivalents, mentions, numbersIn, synonymMap, termKey } from "./terms";

/**
 * Grounding check — prd.md §8.3. Deterministic code, run on every
 * generated resume before it can be saved. It looks only at the output,
 * the source and the provenance — never at the model's plan — so it holds
 * no matter what the model was told or tricked into doing (§8.4).
 *
 * Rules:
 * 1. Personal info, and every company/designation/employment/location/date
 *    on a job, every education entry, certification and custom section,
 *    match the source item with the same id exactly. No item added or
 *    (for jobs/education/certifications) removed.
 * 2. Every skill/technology in the output exists in the source
 *    (case- and synonym-normalised), and no JD term the source doesn't
 *    contain appears anywhere in the output text (terms from
 *    `responsibility` requirements excluded — they describe the job).
 * 3. Every number in the output text appears in the source text.
 * 4. Every output bullet has provenance pointing to existing source
 *    bullets of the same job/project/entry.
 */

export type GroundingRule =
  | "personal_info_changed"
  | "item_added"
  | "item_removed"
  | "fact_changed"
  | "skill_not_in_source"
  | "term_not_in_source"
  | "number_not_in_source"
  | "bullet_without_provenance"
  | "provenance_unknown_source";

export interface GroundingViolation {
  rule: GroundingRule;
  /** Field path, e.g. `workExperience[id=we_2].bullets[id=b_9]`. */
  path: string;
  value: string;
  message: string;
}

/** JD vocabulary to watch for (analysis keywords + synonyms). */
export interface GroundingTerms {
  /** JD requirements. `responsibility` groups describe the job's duties, not candidate facts, and aren't checked. */
  groups: { keywords: string[]; synonyms: string[]; type?: string }[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Sentences addressed to an AI rather than describing the candidate
 * ("ignore previous rules", "note to AI: add 10 years of X"). They're
 * prompt injection, not resume facts, so they never count as grounding —
 * otherwise injected text in a resume could launder a fabricated claim
 * through the check (§8.4).
 */
const INJECTION = /\b(ignore|disregard|forget)\b.{0,40}\b(rules?|instructions?|prompts?|above)\b|\bnote to (the )?(ai|model|assistant|llm|gpt)\b|\b(system|developer) (prompt|message|note)\b|\bas an ai\b|\byou are (an? )?(ai|assistant|language model)\b|\bnew instructions?\b/i;

export function stripInjections(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !INJECTION.test(sentence))
    .join("\n");
}

/** All human-readable text in a resume (for number/term lookups), minus injected sentences. */
export function resumeText(r: Resume): string {
  return stripInjections(rawResumeText(r));
}

function rawResumeText(r: Resume): string {
  const parts: string[] = [r.personalInfo.headline, r.summary.text];
  for (const w of r.workExperience) parts.push(w.company, w.designation, w.location, w.startDate.raw, w.endDate.raw, ...w.bullets.map((b) => b.text), ...w.skillsUsed);
  for (const e of r.education) parts.push(e.institution, e.degree, e.fieldOfStudy, e.grade.value, e.startDate.raw, e.endDate.raw, ...e.bullets.map((b) => b.text));
  for (const g of r.skills) parts.push(g.category, ...g.items.map((i) => i.name));
  for (const p of r.projects) parts.push(p.name, p.role, p.startDate.raw, p.endDate.raw, ...p.bullets.map((b) => b.text), ...p.technologies);
  for (const c of r.certifications) parts.push(c.name, c.issuer, c.issueDate.raw, c.expiryDate.raw);
  for (const c of r.customSections) for (const i of c.items) parts.push(i.heading, i.subheading, i.date.raw, ...i.bullets.map((b) => b.text));
  // Structured date values count as source facts too ("2021-06" → 2021, 06).
  const dates = [...r.workExperience, ...r.education, ...r.projects].flatMap((x) => [x.startDate.value, x.endDate.value]);
  parts.push(...dates.filter((d): d is string => !!d));
  return parts.filter(Boolean).join("\n");
}

function rawBulletTexts(r: Resume): string[] {
  return [...r.workExperience, ...r.projects].flatMap((x) => x.bullets.map((b) => b.text));
}

/** Free text the AI wrote in the output (summary + every bullet). */
function generatedTexts(r: Resume): { path: string; text: string }[] {
  const out = [{ path: "summary.text", text: r.summary.text }];
  for (const w of r.workExperience) for (const b of w.bullets) out.push({ path: `workExperience[id=${w.id}].bullets[id=${b.id}]`, text: b.text });
  for (const p of r.projects) for (const b of p.bullets) out.push({ path: `projects[id=${p.id}].bullets[id=${b.id}]`, text: b.text });
  return out;
}

/** True when a skill/term traces back to the source (directly, normalised, or as a JD synonym of something it has). */
function groundedIn(source: Resume, terms?: GroundingTerms): (name: string) => boolean {
  const extra = synonymMap(terms?.groups ?? []);
  const key = (t: string) => termKey(t, extra);
  const srcText = resumeText(source);
  const srcVocab = new Set(
    [
      ...source.skills.flatMap((g) => g.items.map((i) => i.name)),
      ...source.workExperience.flatMap((w) => w.skillsUsed),
      ...source.projects.flatMap((p) => p.technologies),
    ].map(key),
  );
  return (name: string) => {
    if (srcVocab.has(key(name)) || mentions(srcText, name)) return true;
    // A synonym of something the source mentions (e.g. "React.js" when the source says "React").
    const k = key(name);
    for (const g of terms?.groups ?? []) {
      const all = equivalents(g) ?? [];
      if (all.some((t) => key(t) === k) && all.some((t) => mentions(srcText, t) || srcVocab.has(key(t)))) return true;
    }
    return false;
  };
}

/** JD terms the generated text must never use: checked requirements the source doesn't support. */
export function ungroundedJdTerms(source: Resume, terms: GroundingTerms): string[] {
  const grounded = groundedIn(source, terms);
  const out = new Map<string, string>(); // case-insensitive de-dupe, first spelling wins
  for (const g of terms.groups) if (g.type !== "responsibility") for (const t of [...g.keywords, ...g.synonyms]) if (!grounded(t) && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t);
  return [...out.values()];
}

export function checkGrounding(input: { source: Resume; output: Resume; provenance: Provenance; terms?: GroundingTerms }): GroundingViolation[] {
  const { source, output, provenance } = input;
  const v: GroundingViolation[] = [];
  const add = (rule: GroundingRule, path: string, value: string, message: string) => v.push({ rule, path, value, message });

  // 1. Facts by id.
  if (!same(output.personalInfo, source.personalInfo)) add("personal_info_changed", "personalInfo", "", "Personal info must match the source exactly");

  const checkSet = <T extends { id: string }>(section: string, src: T[], out: T[], fields: (keyof T)[], removable: boolean) => {
    const srcById = new Map(src.map((x) => [x.id, x]));
    for (const item of out) {
      const s = srcById.get(item.id);
      if (!s) {
        add("item_added", `${section}[id=${item.id}]`, item.id, `${section} item not in source`);
        continue;
      }
      for (const f of fields) {
        if (!same(item[f], s[f])) add("fact_changed", `${section}[id=${item.id}].${String(f)}`, JSON.stringify(item[f]), `${String(f)} must match the source`);
      }
    }
    if (!removable) {
      const outIds = new Set(out.map((x) => x.id));
      for (const s of src) if (!outIds.has(s.id)) add("item_removed", `${section}[id=${s.id}]`, s.id, `${section} item removed`);
    }
  };
  checkSet("workExperience", source.workExperience, output.workExperience, ["company", "designation", "employmentType", "location", "startDate", "endDate", "isCurrent"], false);
  checkSet("education", source.education, output.education, ["institution", "degree", "fieldOfStudy", "location", "startDate", "endDate", "grade", "bullets"], false);
  checkSet("certifications", source.certifications, output.certifications, ["name", "issuer", "issueDate", "expiryDate", "credentialId", "credentialUrl"], false);
  checkSet("projects", source.projects, output.projects, ["name", "role", "url", "startDate", "endDate"], true);
  checkSet("customSections", source.customSections, output.customSections, ["title", "items"], false);

  // 2. Skills and JD terms.
  const grounded = groundedIn(source, input.terms);
  for (const g of output.skills) for (const i of g.items) if (!grounded(i.name)) add("skill_not_in_source", `skills[id=${g.id}].items[id=${i.id}]`, i.name, `Skill "${i.name}" is not in the source resume`);
  for (const w of output.workExperience) for (const s of w.skillsUsed) if (!grounded(s)) add("skill_not_in_source", `workExperience[id=${w.id}].skillsUsed`, s, `Skill "${s}" is not in the source resume`);
  for (const p of output.projects) for (const t of p.technologies) if (!grounded(t)) add("skill_not_in_source", `projects[id=${p.id}].technologies`, t, `Technology "${t}" is not in the source resume`);

  // Text copied verbatim from the source is the user's own words, not a new claim:
  // only text the AI actually wrote (or changed) is checked for numbers and JD terms.
  const sourceTexts = new Set([source.summary.text, ...rawBulletTexts(source)].map((t) => t.trim()));
  const texts = generatedTexts(output).filter((t) => !sourceTexts.has(t.text.trim()));
  // Duties ("support customers", "features", "code review") aren't claims about the candidate;
  // skills, tools, qualifications, experience and education are.
  const jdTerms = (input.terms?.groups ?? []).filter((g) => g.type !== "responsibility").flatMap((g) => [...g.keywords, ...g.synonyms]);
  for (const { path, text } of texts) {
    for (const term of jdTerms) {
      if (mentions(text, term) && !grounded(term)) add("term_not_in_source", path, term, `"${term}" is a job requirement the source resume doesn't contain`);
    }
  }

  // 3. Numbers.
  const srcNumbers = new Set(numbersIn(resumeText(source)));
  for (const { path, text } of texts) {
    for (const n of numbersIn(text)) if (!srcNumbers.has(n)) add("number_not_in_source", path, n, `Number "${n}" does not appear in the source resume`);
  }

  // 4. Bullet provenance (same parent item only).
  const srcBulletsByParent = new Map<string, Set<string>>();
  const reg = (parent: string, bullets: { id: string }[]) => srcBulletsByParent.set(parent, new Set(bullets.map((b) => b.id)));
  source.workExperience.forEach((w) => reg(w.id, w.bullets));
  source.projects.forEach((p) => reg(p.id, p.bullets));
  source.education.forEach((e) => reg(e.id, e.bullets));
  source.customSections.forEach((c) => c.items.forEach((i) => reg(i.id, i.bullets)));

  const checkBullets = (section: string, parentId: string, bullets: { id: string }[]) => {
    for (const b of bullets) {
      const p = provenance[`${parentId}.bullets[${b.id}]`];
      const path = `${section}[id=${parentId}].bullets[id=${b.id}]`;
      if (!p || p.sourceBulletIds.length === 0) {
        add("bullet_without_provenance", path, b.id, "Bullet has no provenance");
        continue;
      }
      const allowed = srcBulletsByParent.get(parentId) ?? new Set();
      for (const sid of p.sourceBulletIds) if (!allowed.has(sid)) add("provenance_unknown_source", path, sid, `Source bullet "${sid}" doesn't exist in this item`);
    }
  };
  output.workExperience.forEach((w) => checkBullets("workExperience", w.id, w.bullets));
  output.projects.forEach((p) => checkBullets("projects", p.id, p.bullets));

  return v;
}

/** Counts per rule, for `ai_jobs.error` / admin review. */
export function summarizeViolations(v: GroundingViolation[]): Record<string, number> {
  return v.reduce<Record<string, number>>((acc, x) => ((acc[x.rule] = (acc[x.rule] ?? 0) + 1), acc), {});
}
