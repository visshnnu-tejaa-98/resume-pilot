import { z } from "zod";
import { strictResponseFormat } from "../strict-schema";

/**
 * What the model returns when scoring (prd.md §9.1 step 1): a judgement
 * per JD requirement with the resume item ids that evidence it, plus a
 * short assessment and recommendations. The score itself is computed in
 * code (engine.ts) — the model never outputs a number.
 */

export const MATCH_STATUSES = ["matched", "partial", "missing"] as const;
export const RECOMMENDATION_AREAS = ["summary", "ordering", "bullets", "formatting", "content"] as const;

export const scoringEvaluationSchema = z.object({
  requirements: z
    .array(
      z.object({
        requirementId: z.string(),
        status: z.enum(MATCH_STATUSES),
        /** Ids of resume items (bullets, jobs, skills, …) that prove it; "summary" for the summary. */
        evidenceIds: z.array(z.string()).max(6),
        reason: z.string().trim().max(300),
      }),
    )
    .max(80),
  assessment: z.string().trim().max(1200),
  recommendations: z
    .array(z.object({ area: z.enum(RECOMMENDATION_AREAS), title: z.string().trim().min(1).max(120), detail: z.string().trim().max(400) }))
    .max(8),
});

export type ScoringEvaluation = z.infer<typeof scoringEvaluationSchema>;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const scoringResponseFormat = () => strictResponseFormat("ats_evaluation", scoringEvaluationSchema);

export class EvaluationOutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EvaluationOutputError";
  }
}

export function parseScoringEvaluation(json: unknown): ScoringEvaluation {
  const r = scoringEvaluationSchema.safeParse(json);
  if (!r.success) throw new EvaluationOutputError(`ATS evaluation failed validation: ${r.error.issues[0]?.message ?? "invalid"}`, { cause: r.error });
  return r.data;
}
