import type { Resume } from "@resume-pilot/validators/resume";
import { assembleVersion } from "./assemble";
import type { GenerationPlan } from "./plan";

/**
 * Page budget for generated resumes. A tailored resume should match the
 * length of the upload (1–2 pages normally, 3 only when the source itself
 * was 3+). The model is told the target; this module enforces it
 * deterministically by dropping the lowest-priority bullets from the
 * plan. Dropping only removes source-backed content, so it can never
 * break the grounding check (§8.3).
 *
 * The estimate is a text-volume heuristic calibrated on the A4 templates
 * (10pt, 16/18mm margins): ~3,800 non-space characters of visible text per
 * page, plus a fixed cost per line/entry/section for wrapping and spacing.
 */

export const NONSPACE_CHARS_PER_PAGE = 3800;
const BULLET_COST = 40;
const ENTRY_COST = 60;
const SECTION_COST = 90;
const MIN_JOB_BULLETS = 2;
const MIN_PROJECT_BULLETS = 1;

const SKIP_KEYS = new Set(["id", "layout", "schemaVersion", "meta", "kind", "url", "sourceBulletIds"]);

function nonSpace(v: unknown, hidden: Set<string>): number {
  if (typeof v === "string") return v.replace(/\s+/g, "").length;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + nonSpace(x, hidden), 0);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && hidden.has(o.id)) return 0;
    let n = 0;
    for (const [k, x] of Object.entries(o)) if (!SKIP_KEYS.has(k)) n += nonSpace(x, hidden);
    return n;
  }
  return 0;
}

/** Estimated printed A4 pages for a resume (fractional). */
export function estimatePages(r: Resume): number {
  const hidden = new Set(r.layout?.hiddenItems ?? []);
  const { layout: _l, schemaVersion: _s, ...content } = r as Resume & Record<string, unknown>;
  const visibleProjects = r.projects.filter((p) => !hidden.has(p.id));
  const bullets =
    r.workExperience.reduce((n, w) => n + w.bullets.length, 0) +
    visibleProjects.reduce((n, p) => n + p.bullets.length, 0) +
    r.education.reduce((n, e) => n + e.bullets.length, 0);
  const entries = r.workExperience.length + visibleProjects.length + r.education.length + r.certifications.length + r.skills.length;
  const sections = Object.entries(content).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)).length;
  const total = nonSpace(content, hidden) + bullets * BULLET_COST + entries * ENTRY_COST + sections * SECTION_COST;
  return total / NONSPACE_CHARS_PER_PAGE;
}

/** Pages the upload had; `null` when unknown (TeX/DOCX without metadata). */
export function targetPagesFor(sourcePages: number | null | undefined): number {
  if (!sourcePages || sourcePages < 1) return 2;
  return Math.min(3, Math.round(sourcePages));
}

/** Makes every source job explicit in the plan so its bullets can be trimmed. */
function explicitPlan(source: Resume, plan: GenerationPlan): GenerationPlan {
  const byId = new Map(plan.workExperience.map((w) => [w.id, w]));
  return {
    ...plan,
    workExperience: source.workExperience.map((w) => {
      const p = byId.get(w.id);
      if (p && p.bullets.length) return { id: w.id, bullets: [...p.bullets] };
      return { id: w.id, bullets: w.bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id], changeType: "unchanged" as const })) };
    }),
    projects: plan.projects.map((p) => ({ ...p, bullets: [...p.bullets] })),
  };
}

/**
 * Trims the plan until the assembled resume fits `targetPages`. Removes the
 * last (lowest-priority, since the model orders by relevance) bullet from
 * whichever job/project currently has the most, older jobs first on ties;
 * then drops trailing projects. Never empties a job.
 */
export function fitPlanToPages(source: Resume, plan: GenerationPlan, targetPages: number): GenerationPlan {
  const out = explicitPlan(source, plan);
  for (let guard = 0; guard < 300; guard++) {
    if (estimatePages(assembleVersion(source, out).resume) <= targetPages) return out;
    const candidates = [
      ...out.workExperience.map((w, i) => ({ list: w.bullets, min: MIN_JOB_BULLETS, order: i })),
      ...out.projects.map((p, i) => ({ list: p.bullets, min: MIN_PROJECT_BULLETS, order: 1000 + i })),
    ].filter((c) => c.list.length > c.min);
    if (candidates.length) {
      candidates.sort((a, b) => b.list.length - a.list.length || b.order - a.order);
      candidates[0]!.list.pop();
      continue;
    }
    if (out.projects.length > 1) {
      out.projects.pop();
      continue;
    }
    return out; // nothing left to trim safely
  }
  return out;
}
