export {
  createOpenAIClient,
  DEFAULT_EXTRACTION_MODEL,
  EXTRACTION_INSTRUCTIONS,
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_PROMPT_VERSION,
  structureResume,
  StructuringError,
  wrapResumeText,
  type ResponsesClient,
  type StructureResult,
  type StructureUsage,
  type StructuringFailure,
} from "./structure";
export {
  analyzeJobDescription,
  JD_ANALYSIS_INSTRUCTIONS,
  JD_ANALYSIS_PROMPT_VERSION,
  type JdAnalysisResult,
} from "./jd-analysis";
export { callStructuredOutput, wrapData } from "./responses";
export { assembleVersion, type AssembledVersion, type Gap } from "./generation/assemble";
export { GENERATION_INSTRUCTIONS, GENERATION_PROMPT_VERSION, generateTailoredResume, GroundingFailedError, type GenerationResult } from "./generation/generate";
export { checkGrounding, resumeText, summarizeViolations, ungroundedJdTerms, type GroundingRule, type GroundingTerms, type GroundingViolation } from "./generation/grounding";
export { estimatePages, fitPlanToPages, NONSPACE_CHARS_PER_PAGE, targetPagesFor } from "./generation/fit";
export { generationPlanResponseFormat, generationPlanSchema, parseGenerationPlan, type GenerationPlan } from "./generation/plan";
export { fold, mentions, numbersIn, termKey } from "./generation/terms";
export {
  candidateYears,
  computeScore,
  DIMENSIONS,
  keywordHits,
  resumeLines,
  SCORE_DISCLAIMER,
  SCORING_METHOD_VERSION,
  structureChecks,
  visibleResume,
  type DimensionKey,
  type KeywordHit,
  type RequirementResult,
  type ScoreResult,
  type StructureCheck,
} from "./scoring/engine";
export { evaluateResume, SCORING_INSTRUCTIONS, SCORING_PROMPT_VERSION, type EvaluationResult } from "./scoring/score";
export { parseScoringEvaluation, scoringEvaluationSchema, type MatchStatus, type ScoringEvaluation } from "./scoring/schema";
export { strictResponseFormat } from "./strict-schema";
export { buildReport, scoreResume, type StoredReport } from "./scoring/report";
