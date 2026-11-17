import type { JdAnalysis } from "@resume-pilot/validators";
import type { Resume } from "@resume-pilot/validators/resume";
import type { ResponsesClient, StructureUsage } from "../responses";
import { computeScore, SCORE_DISCLAIMER, SCORING_METHOD_VERSION, type ScoreResult } from "./engine";
import type { ScoringEvaluation } from "./schema";
import { evaluateResume } from "./score";

/** The JSON stored in `ats_reports.report` (prd.md §9.1 step 4: "all inputs"). */
export interface StoredReport {
  methodVersion: string;
  asOf: string;
  band: ScoreResult["band"];
  requirements: ScoreResult["requirements"];
  checks: ScoreResult["checks"];
  years: number;
  minYears: number | null;
  assessment: string;
  recommendations: ScoringEvaluation["recommendations"];
  model: string;
  promptVersion: string;
  disclaimer: string;
  /** Exact inputs, so a stored report can be recomputed and audited. */
  inputs: { analysis: JdAnalysis; evaluation: ScoringEvaluation };
}

/** Builds the stored report from inputs (pure; used by scoreResume and for re-computation). */
export function buildReport(input: { resume: Resume; analysis: JdAnalysis; evaluation: ScoringEvaluation; asOf: Date; model: string; promptVersion: string }) {
  const s = computeScore(input);
  const report: StoredReport = {
    methodVersion: SCORING_METHOD_VERSION,
    asOf: input.asOf.toISOString(),
    band: s.band,
    requirements: s.requirements,
    checks: s.checks,
    years: s.years,
    minYears: s.minYears,
    assessment: input.evaluation.assessment,
    recommendations: input.evaluation.recommendations,
    model: input.model,
    promptVersion: input.promptVersion,
    disclaimer: SCORE_DISCLAIMER,
    inputs: { analysis: input.analysis, evaluation: input.evaluation },
  };
  return { overallScore: s.overall, breakdown: s.dimensions, report };
}

/** AI evaluation + deterministic score — what the worker runs for one scoring job. */
export async function scoreResume(
  client: ResponsesClient,
  input: { resume: Resume; analysis: JdAnalysis; model: string; maxOutputTokens: number; asOf: Date },
): Promise<ReturnType<typeof buildReport> & { usage: StructureUsage }> {
  const e = await evaluateResume(client, input);
  return { ...buildReport({ ...input, evaluation: e.evaluation, model: e.model, promptVersion: e.promptVersion }), usage: e.usage };
}
