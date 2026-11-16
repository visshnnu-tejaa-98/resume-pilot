import { BUILT_IN_SECTIONS, strictify, type JsonSchema } from "@resume-pilot/validators/resume";
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

const STRIP = ["maxItems", "minItems", "minimum", "maximum", "pattern"];

function strip(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.includes(k)) continue;
    if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([n, p]) => [n, strip(p)]));
    else if (k === "items") out.items = strip(v as JsonSchema);
    else if (k === "anyOf") out.anyOf = (v as JsonSchema[]).map(strip);
    else out[k] = v;
  }
  return out;
}

export function generationPlanResponseFormat() {
  const schema = z.toJSONSchema(generationPlanSchema, { target: "draft-7", io: "input", reused: "inline" }) as JsonSchema;
  return { type: "json_schema" as const, name: "tailoring_plan", strict: true, schema: strip(strictify(schema)) };
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
