/**
 * Turns the raw reason stored in ai_jobs.error into a message for the
 * person who ran the action. Raw reasons (grounding rule counts, provider
 * errors) stay in ai_jobs.error for admins.
 *
 * Token-limit failures get their own message because the fix is an admin
 * setting — the per-action "Max output tokens" in Admin → Pricing — so
 * admins also get a pointer to exactly what to raise.
 */

export type AiAction = "generation" | "ats_scoring" | "jd_analysis";

export interface AiFailure {
  kind: "token_limit" | "timeout" | "busy" | "grounding" | "deleted" | "analysis" | "unknown";
  /** For everyone. */
  message: string;
  /** Extra line for admins only (what to change). */
  adminHint?: string;
}

const STEP_LABEL: Record<AiAction, string> = {
  jd_analysis: "JD analysis",
  generation: "Generation",
  ats_scoring: "ATS scoring",
};

const WHAT: Record<AiAction, string> = {
  jd_analysis: "analysis of this job description",
  generation: "tailored resume",
  ats_scoring: "score report",
};

export function describeAiFailure(error: string | null | undefined, action: AiAction): AiFailure {
  const e = error ?? "";
  // The analysis step runs inside generation/scoring; its own reason is appended after a colon.
  const inAnalysis = /job analysis didn't finish/i.test(e);
  const step: AiAction = inAnalysis ? "jd_analysis" : action;

  if (/max_output_tokens/i.test(e)) {
    return {
      kind: "token_limit",
      message: `This job description and resume needed a longer AI answer than our current limit allows, so the ${WHAT[step]} stopped before it finished. Our team can raise the limit — please try again a little later, or with a shorter job description.`,
      adminHint: `Raise “${STEP_LABEL[step]} → Max output tokens” in Admin → Pricing. Reasoning models spend part of this budget thinking before they answer.`,
    };
  }
  if (/timed out|timeout|ETIMEDOUT|ECONNRESET/i.test(e)) {
    return { kind: "timeout", message: "The AI took too long to respond. Please try again in a minute." };
  }
  if (/HTTP 429|rate limit|HTTP 5\d\d|overloaded/i.test(e)) {
    return { kind: "busy", message: "The AI service is busy right now. Please try again in a few minutes." };
  }
  if (/grounding/i.test(e)) {
    return { kind: "grounding", message: "Our fact check couldn't confirm every detail against your resume, so nothing was saved." };
  }
  if (/deleted/i.test(e)) {
    return { kind: "deleted", message: action === "ats_scoring" ? "The resume version was deleted." : "The resume you started from was deleted." };
  }
  if (inAnalysis || /analysis/i.test(e)) {
    return { kind: "analysis", message: "We couldn't analyse the job description." };
  }
  return { kind: "unknown", message: "Something went wrong on our side." };
}
