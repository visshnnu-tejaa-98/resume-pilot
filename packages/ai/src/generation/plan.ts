import { BUILT_IN_SECTIONS } from "@resume-pilot/validators/resume";
import { strictResponseFormat } from "../strict-schema";
import { z } from "zod";

/**
 * What the model returns for a generation: a *tailoring plan* that refers
 * to source items by id — never a free-form resume (prd.md §8.1 step 4,
 * §8.2). Companies, titles, institutions, degrees, certifications and
 * dates are not in this shape at all; the assembler copies them from the
 * source, so the model has no way to change them.
 */

export const CHANGE_TYPES = ["rewritten", "reordered", "unchanged", "merged"] as const;

const plannedBullet = z.object({
  text: z.string().trim().min(1).max(1000),
  /** Source bullet ids this bullet is based on (same job/project). */
  sourceBulletIds: z.array(z.string()).min(1).max(5),
  changeType: z.enum(CHANGE_TYPES),
});

export const generationPlanSchema = z.object({
  summary: z.string().trim().max(1500),
  /** Order of sections on the page (built-in keys). */
  sectionOrder: z.array(z.enum(BUILT_IN_SECTIONS)).max(BUILT_IN_SECTIONS.length),
  /** One entry per source job, in any order; bullets in the order to show. */
  workExperience: z
    .array(z.object({ id: z.string(), bullets: z.array(plannedBullet).max(12) }))
    .max(30),
  /** Projects to show, in display order; omitted projects are hidden. */
  projects: z.array(z.object({ id: z.string(), bullets: z.array(plannedBullet).max(8) })).max(30),
  /** Skill groups in display order; item names must come from the source. */
  skills: z.array(z.object({ category: z.string().trim().min(1).max(100), items: z.array(z.string().trim().min(1).max(100)).max(60) })).max(20),
  /** JD requirements the source doesn't support (§8.2 gap list). */
  gaps: z
    .array(z.object({ requirementId: z.string().nullable(), keyword: z.string().trim().min(1).max(120), note: z.string().trim().max(300) }))
    .max(40),
});

export type GenerationPlan = z.infer<typeof generationPlanSchema>;

export function generationPlanResponseFormat() {
  return strictResponseFormat("tailoring_plan", generationPlanSchema);
}

export class PlanOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlanOutputError";
  }
}

export function parseGenerationPlan(json: unknown): GenerationPlan {
  const parsed = generationPlanSchema.safeParse(json);
  if (!parsed.success) throw new PlanOutputError(`Tailoring plan failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}`, { cause: parsed.error });
  return parsed.data;
}
