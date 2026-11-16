import { z } from "zod";
import { strictify, type JsonSchema } from "./resume/structured-output";

/**
 * JD analysis — prd.md §7.2. Structured output from the model, stored
 * in `jd_analyses` (one row per JD) and reused by generation, ATS
 * scoring and comparison.
 *
 * The model fills `jdAnalysisModelShape` (no ids). Requirement ids
 * (r1, r2, …) are app-assigned in `fromJdAnalysisOutput`, so they're
 * stable, unique and never model-controlled.
 */

export const REQUIREMENT_TYPES = ["skill", "tool", "qualification", "experience", "education", "responsibility"] as const;
export const REQUIREMENT_PRIORITIES = ["required", "preferred"] as const;

/** Caps keep a pathological JD from producing an unbounded payload. */
export const JD_ANALYSIS_LIMITS = { requirements: 60, keywords: 10, synonyms: 10, terms: 40, text: 500, term: 120 } as const;

const term = z.string().trim().min(1).max(JD_ANALYSIS_LIMITS.term);

const requirementModelShape = z.object({
  text: z.string().trim().min(1).max(JD_ANALYSIS_LIMITS.text),
  type: z.enum(REQUIREMENT_TYPES),
  priority: z.enum(REQUIREMENT_PRIORITIES),
  keywords: z.array(term).max(JD_ANALYSIS_LIMITS.keywords),
  synonyms: z.array(term).max(JD_ANALYSIS_LIMITS.synonyms),
});

/** What the model returns. */
export const jdAnalysisModelShape = z.object({
  jobTitle: z.string().trim().max(200).nullable(),
  seniority: z.string().trim().max(80).nullable(),
  minYearsExperience: z.number().int().min(0).max(50).nullable(),
  requirements: z.array(requirementModelShape).max(JD_ANALYSIS_LIMITS.requirements),
  educationRequirements: z.array(z.string().trim().min(1).max(JD_ANALYSIS_LIMITS.text)).max(JD_ANALYSIS_LIMITS.terms),
  domainTerms: z.array(term).max(JD_ANALYSIS_LIMITS.terms),
});

export const jdRequirementSchema = requirementModelShape.extend({ id: z.string().regex(/^r\d+$/) });

/** The stored analysis (§7.2 shape, with ids). */
export const jdAnalysisSchema = jdAnalysisModelShape.extend({ requirements: z.array(jdRequirementSchema).max(JD_ANALYSIS_LIMITS.requirements) });

export type JdRequirement = z.infer<typeof jdRequirementSchema>;
export type JdAnalysis = z.infer<typeof jdAnalysisSchema>;

/** Strict JSON schema for the Responses API, derived from the Zod shape. */
export function jdAnalysisJsonSchema(): JsonSchema {
  const generated = z.toJSONSchema(jdAnalysisModelShape, { target: "draft-7", io: "input", reused: "inline" }) as JsonSchema;
  // Length/range limits aren't reliably accepted in strict mode; Zod re-checks them after.
  return stripKeywords(strictify(generated), ["maxItems", "minItems", "minimum", "maximum", "pattern"]);
}

function stripKeywords(node: JsonSchema, keys: string[]): JsonSchema {
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) {
    if (keys.includes(k)) continue;
    if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([n, p]) => [n, stripKeywords(p, keys)]));
    } else if (k === "items" && v && typeof v === "object") {
      out.items = stripKeywords(v as JsonSchema, keys);
    } else if (k === "anyOf" && Array.isArray(v)) {
      out.anyOf = (v as JsonSchema[]).map((x) => stripKeywords(x, keys));
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** `text.format` for `responses.create`. */
export function jdAnalysisResponseFormat() {
  return { type: "json_schema" as const, name: "jd_analysis", strict: true, schema: jdAnalysisJsonSchema() };
}

export class JdAnalysisOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JdAnalysisOutputError";
  }
}

/** Case-insensitive de-duplication, preserving first spelling and order. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Validates model output and assigns requirement ids. Over-long lists are
 * truncated to the caps rather than rejected; anything structurally wrong
 * throws `JdAnalysisOutputError`.
 */
export function fromJdAnalysisOutput(json: unknown): JdAnalysis {
  const L = JD_ANALYSIS_LIMITS;
  const raw = json as Record<string, unknown> | null;
  const clipped =
    raw && typeof raw === "object"
      ? {
          ...raw,
          requirements: Array.isArray(raw.requirements)
            ? (raw.requirements as Record<string, unknown>[]).slice(0, L.requirements).map((r) => ({
                ...r,
                keywords: Array.isArray(r?.keywords) ? dedupe(r.keywords as string[]).slice(0, L.keywords) : r?.keywords,
                synonyms: Array.isArray(r?.synonyms) ? dedupe(r.synonyms as string[]).slice(0, L.synonyms) : r?.synonyms,
              }))
            : raw.requirements,
          educationRequirements: Array.isArray(raw.educationRequirements) ? (raw.educationRequirements as string[]).slice(0, L.terms) : raw.educationRequirements,
          domainTerms: Array.isArray(raw.domainTerms) ? dedupe(raw.domainTerms as string[]).slice(0, L.terms) : raw.domainTerms,
        }
      : raw;

  const parsed = jdAnalysisModelShape.safeParse(clipped);
  if (!parsed.success) {
    throw new JdAnalysisOutputError(`JD analysis failed validation: ${parsed.error.issues[0]?.message ?? "invalid"}`, { cause: parsed.error });
  }
  return {
    ...parsed.data,
    requirements: parsed.data.requirements.map((r, i) => ({ id: `r${i + 1}`, ...r })),
  };
}

/** Required keywords first — what job cards and the ATS report show as the headline terms. */
export function topKeywords(analysis: Pick<JdAnalysis, "requirements">, limit = 6): string[] {
  const ordered = [...analysis.requirements].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "required" ? -1 : 1));
  return dedupe(ordered.flatMap((r) => r.keywords)).slice(0, limit);
}
