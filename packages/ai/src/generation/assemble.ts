import {
  BUILT_IN_SECTIONS,
  collectIds,
  IdAllocator,
  type BuiltInSection,
  type Provenance,
  type Resume,
} from "@resume-pilot/validators/resume";
import type { GenerationPlan } from "./plan";
import { termKey } from "./terms";

export interface Gap {
  requirementId: string | null;
  keyword: string;
  note: string;
}

export interface AssembledVersion {
  resume: Resume;
  provenance: Provenance;
  gaps: Gap[];
}

type Bullet = { id: string; text: string };

/**
 * Builds the generated resume from the source + the model's plan
 * (prd.md §8.1 steps 4–6). Only the fields the AI may change (§8.2) come
 * from the plan: summary, bullet wording/order/selection, project and
 * skill selection/order, section order. Everything factual — personal
 * info, companies, titles, institutions, degrees, certifications, every
 * date — is copied from the source item with the same id.
 *
 * The assembler is lenient (unknown ids are ignored, missing jobs keep
 * their source bullets); the grounding check that runs afterwards is
 * strict and is what decides whether the result may be saved.
 */
export function assembleVersion(source: Resume, plan: GenerationPlan): AssembledVersion {
  const out = structuredClone(source);
  const alloc = new IdAllocator(collectIds(source));
  const provenance: Provenance = {};
  const usedBulletIds = new Set<string>();

  /** Planned bullets → resume bullets + provenance, reusing a source id when 1:1. */
  const buildBullets = <B extends Bullet>(
    parentId: string,
    sourceBullets: B[],
    planned: GenerationPlan["workExperience"][number]["bullets"] | undefined,
  ): B[] => {
    if (!planned || planned.length === 0) {
      for (const b of sourceBullets) {
        provenance[`${parentId}.bullets[${b.id}]`] = { sourceBulletIds: [b.id], changeType: "unchanged" };
        usedBulletIds.add(b.id);
      }
      return sourceBullets;
    }
    return planned.map((p) => {
      const first = sourceBullets.find((b) => b.id === p.sourceBulletIds[0]);
      const reuse = p.sourceBulletIds.length === 1 && first && !usedBulletIds.has(first.id);
      const id = reuse ? first.id : alloc.take("bullet");
      usedBulletIds.add(id);
      provenance[`${parentId}.bullets[${id}]`] = { sourceBulletIds: p.sourceBulletIds, changeType: p.changeType };
      // Keep non-text fields (e.g. work bullet `kind`) from the primary source bullet.
      return { ...(first ?? sourceBullets[0] ?? {}), id, text: p.text } as B;
    });
  };

  // Summary: rewritten from existing facts.
  out.summary = { text: plan.summary };

  // Work: every source job stays, in source (chronological) order. Only bullets change.
  const workPlan = new Map(plan.workExperience.map((w) => [w.id, w]));
  out.workExperience = source.workExperience.map((w) => ({ ...w, bullets: buildBullets(w.id, w.bullets, workPlan.get(w.id)?.bullets) }));

  // Projects: the plan picks which to show and in what order; the rest are hidden, not deleted.
  const projectPlan = plan.projects.filter((p) => source.projects.some((s) => s.id === p.id));
  const shown = new Set(projectPlan.map((p) => p.id));
  const ordered = [
    ...projectPlan.map((p) => source.projects.find((s) => s.id === p.id)!),
    ...source.projects.filter((s) => !shown.has(s.id)),
  ];
  out.projects = ordered.map((p) => ({ ...p, bullets: buildBullets(p.id, p.bullets, projectPlan.find((x) => x.id === p.id)?.bullets) }));
  const hiddenProjects = plan.projects.length ? source.projects.filter((p) => !shown.has(p.id)).map((p) => p.id) : [];

  // Education / custom sections: unchanged, but their bullets still get identity provenance.
  for (const e of out.education) buildBullets(e.id, e.bullets, undefined);
  for (const c of out.customSections) for (const i of c.items) buildBullets(i.id, i.bullets, undefined);

  // Skills: regroup and reorder; names are matched to source items to keep their ids.
  const sourceItems = source.skills.flatMap((g) => g.items);
  const byKey = new Map(sourceItems.map((i) => [termKey(i.name), i]));
  if (plan.skills.length) {
    const seen = new Set<string>();
    out.skills = plan.skills
      .map((g) => {
        const existingGroup = source.skills.find((s) => s.category.trim().toLowerCase() === g.category.trim().toLowerCase());
        const items = g.items
          .filter((name) => {
            const k = termKey(name);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .map((name) => {
            const match = byKey.get(termKey(name));
            // Keep the source spelling for known skills; unknown names keep the model's text
            // so the grounding check can see (and reject) them.
            return match ? { ...match } : { id: alloc.take("skill"), name };
          });
        return { id: existingGroup?.id ?? alloc.take("skillGroup"), category: g.category, items };
      })
      .filter((g) => g.items.length > 0);
  }

  // Section order: planned built-ins first, then any remaining built-ins and custom sections.
  const planned = plan.sectionOrder.filter((s, i, a) => a.indexOf(s) === i);
  const rest = source.layout.sectionOrder.filter((s) => !planned.includes(s as BuiltInSection));
  out.layout = {
    ...source.layout,
    sectionOrder: [...planned, ...rest, ...BUILT_IN_SECTIONS.filter((s) => !planned.includes(s) && !rest.includes(s))],
    hiddenItems: [...new Set([...source.layout.hiddenItems, ...hiddenProjects])],
  };

  return { resume: out, provenance, gaps: plan.gaps };
}
