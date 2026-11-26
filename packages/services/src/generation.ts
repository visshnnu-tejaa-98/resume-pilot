import { aiJobs, creditHolds, jobDescriptions, resumes, resumeVersions, type Database } from "@resume-pilot/database";
import type { ActionSettings, JdAnalysis } from "@resume-pilot/validators";
import { extractionMetaSchema, resumeSchema, unreviewedLowConfidence, type Provenance, type Resume } from "@resume-pilot/validators/resume";
import type { TokenUsage } from "@resume-pilot/credits";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { captureHold, estimateAction, placeHold, releaseHold } from "./credits";
import { JdNotFoundError } from "./jd";
import { estimateJdAnalysis, getJdAnalysis, processJdAnalysis, startJdAnalysis, type JdAnalyzeFn } from "./jd-analysis";
import { getPricingConfigByVersion } from "./pricing";
import { resumeContentHash } from "./structuring";
import { getVersion, type GenerationMeta } from "./versions";

/**
 * Tailored resume generation — prd.md §8.1, §3.4.
 *
 * estimate → (user confirms) → start: places the JD-analysis hold if the
 * JD isn't analysed yet, then the generation hold → worker: runs the
 * analysis first if needed, generates, grounding-checks (in the injected
 * `generate`, see packages/ai), saves a new `resume_versions` row and
 * captures. Any failure releases the generation hold in full.
 */

export class GenerationError extends Error {
  constructor(
    readonly code: "not_ready" | "estimate_changed" | "not_found",
    message: string,
    readonly credits?: number,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export const generationInputSchema = z.object({
  sourceVersionId: z.uuid(),
  jdId: z.uuid(),
  /** The analysis run placed at confirm time, if the JD wasn't analysed. */
  analysisAiJobId: z.uuid().nullable(),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;

async function ownedJd(db: Database, userId: string, jdId: string) {
  const [jd] = await db.select({ id: jobDescriptions.id, text: jobDescriptions.text, companyName: jobDescriptions.companyName, jobTitle: jobDescriptions.jobTitle }).from(jobDescriptions).where(and(eq(jobDescriptions.id, jdId), eq(jobDescriptions.userId, userId)));
  if (!jd) throw new JdNotFoundError();
  return jd;
}

/** The source must be a live version the user owns; an original must be fully reviewed (§5.3 step 7). */
async function readySource(db: Database, userId: string, versionId: string) {
  const v = await getVersion(db, { userId, versionId }).catch(() => {
    throw new GenerationError("not_found", "That resume version isn't available");
  });
  if (v.kind === "original") {
    const [row] = await db.select({ meta: resumeVersions.extractionMeta }).from(resumeVersions).where(eq(resumeVersions.id, v.id));
    const open = unreviewedLowConfidence(extractionMetaSchema.parse(row?.meta ?? {}));
    if (open.length) throw new GenerationError("not_ready", `Check ${open.length} highlighted field${open.length === 1 ? "" : "s"} on your resume before tailoring it`);
  }
  return v;
}

export interface GenerationEstimate {
  lines: { action: "jd_analysis" | "generation"; credits: number }[];
  total: number;
}

/** Step 1: what will run and the most it can cost. Read-only. */
export async function estimateGeneration(db: Database, input: { userId: string; sourceVersionId: string; jdId: string }): Promise<GenerationEstimate> {
  const source = await readySource(db, input.userId, input.sourceVersionId);
  const jd = await ownedJd(db, input.userId, input.jdId);
  const lines: GenerationEstimate["lines"] = [];
  const analysis = await estimateJdAnalysis(db, { userId: input.userId, jdId: jd.id });
  if (!analysis.cached) lines.push({ action: "jd_analysis", credits: analysis.estimate.credits });
  // Input = source resume JSON + the job (its analysis isn't known yet, the text is a safe upper proxy).
  const gen = await estimateAction(db, "generation", [JSON.stringify(source.content), jd.text]);
  lines.push({ action: "generation", credits: gen.credits });
  return { lines, total: lines.reduce((n, l) => n + l.credits, 0) };
}

/**
 * Step 3: on Confirm. `requestId` is generated once per dialog, so a
 * double click or retried request maps to the same hold. Holds never
 * exceed what the user confirmed: the server re-estimates and refuses
 * if the new total is higher.
 */
export async function startGeneration(
  db: Database,
  input: { userId: string; sourceVersionId: string; jdId: string; confirmedCredits: number; requestId: string },
): Promise<{ aiJobId: string; analysisAiJobId: string | null; created: boolean; analysisCreated: boolean }> {
  const est = await estimateGeneration(db, input);
  if (est.total > input.confirmedCredits) throw new GenerationError("estimate_changed", "The estimate changed since you confirmed it. Please review the new amount.", est.total);

  const genKey = `generation:${input.userId}:${input.requestId}`;
  // Already started for this request? Return it untouched (idempotent).
  const [existing] = await db.select({ id: aiJobs.id, input: aiJobs.input }).from(aiJobs).where(eq(aiJobs.idempotencyKey, genKey));
  if (existing) {
    const parsed = generationInputSchema.safeParse(existing.input);
    return { aiJobId: existing.id, analysisAiJobId: parsed.success ? parsed.data.analysisAiJobId : null, created: false, analysisCreated: false };
  }

  let analysisAiJobId: string | null = null;
  let analysisCreated = false;
  const analysisLine = est.lines.find((l) => l.action === "jd_analysis");
  if (analysisLine) {
    const a = await startJdAnalysis(db, { userId: input.userId, jdId: input.jdId, confirmedCredits: analysisLine.credits });
    if (a.status === "running") {
      analysisAiJobId = a.aiJobId;
      analysisCreated = a.created;
    }
  }

  const jd = await ownedJd(db, input.userId, input.jdId);
  const source = await getVersion(db, { userId: input.userId, versionId: input.sourceVersionId });
  const estimate = await estimateAction(db, "generation", [JSON.stringify(source.content), jd.text]);
  try {
    const hold = await placeHold(db, { userId: input.userId, idempotencyKey: genKey, estimate });
    const jobInput: GenerationInput = { sourceVersionId: input.sourceVersionId, jdId: input.jdId, analysisAiJobId };
    await db.update(aiJobs).set({ input: jobInput }).where(eq(aiJobs.id, hold.aiJobId));
    return { aiJobId: hold.aiJobId, analysisAiJobId, created: hold.created, analysisCreated };
  } catch (err) {
    // Can't afford the generation: don't leave the analysis hold behind.
    if (analysisCreated && analysisAiJobId) await releaseHold(db, { aiJobId: analysisAiJobId, reason: "generation could not be started" });
    throw err;
  }
}

/**
 * Page count of the original upload, so the tailored version can match it.
 * PDFs/images record one extraction entry per page; DOCX/TeX record one
 * entry for the whole file, so estimate from text volume (~3,500 non-space
 * chars per full page).
 */
export async function sourcePageCount(db: Database, resumeId: string): Promise<number | null> {
  const [r] = await db.select({ format: resumes.fileFormat, meta: resumes.extractionMeta }).from(resumes).where(eq(resumes.id, resumeId));
  const pages = (r?.meta as { pages?: { chars?: number }[] } | null)?.pages;
  if (!r || !pages?.length) return null;
  if (r.format === "pdf" || r.format === "png" || r.format === "jpg" || r.format === "jpeg") return pages.length;
  const chars = pages.reduce((n, p) => n + (p.chars ?? 0), 0);
  return chars > 0 ? Math.max(1, Math.ceil(chars / 3500)) : null;
}

export interface GenerateFn {
  (input: { source: Resume; analysis: JdAnalysis; model: string; maxOutputTokens: number; sourcePages?: number | null }): Promise<{
    resume: Resume;
    provenance: Provenance;
    gaps: NonNullable<GenerationMeta["gaps"]>;
    usage: TokenUsage;
    model: string;
    promptVersion: string;
    attempts: number;
    firstAttemptViolations: { rule: string }[];
  }>;
}

export type ProcessGenerationResult =
  | { status: "succeeded"; versionId: string; creditsCharged: number }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

/** Worker side of a generation job. */
export async function processGeneration(
  db: Database,
  job: { aiJobId: string },
  deps: { generate: GenerateFn; analyze: JdAnalyzeFn; isFinalAttempt: boolean },
): Promise<ProcessGenerationResult> {
  const [row] = await db
    .select({ job: aiJobs, holdStatus: creditHolds.status })
    .from(aiJobs)
    .innerJoin(creditHolds, eq(creditHolds.aiJobId, aiJobs.id))
    .where(eq(aiJobs.id, job.aiJobId));
  if (!row || row.job.type !== "generation") return { status: "skipped", reason: "generation job not found" };
  const aiJob = row.job;
  if (aiJob.status === "succeeded" || aiJob.status === "failed") return { status: "skipped", reason: `already ${aiJob.status}` };
  if (row.holdStatus !== "active") {
    await releaseHold(db, { aiJobId: aiJob.id, reason: `hold ${row.holdStatus} before the run started` });
    return { status: "skipped", reason: `hold ${row.holdStatus}` };
  }
  const fail = async (reason: string): Promise<ProcessGenerationResult> => {
    await releaseHold(db, { aiJobId: aiJob.id, reason });
    return { status: "failed", reason };
  };

  const parsedInput = generationInputSchema.safeParse(aiJob.input);
  if (!parsedInput.success) return fail("Generation input missing");
  const { sourceVersionId, jdId, analysisAiJobId } = parsedInput.data;

  // §8.1 step 2: the analysis runs first when it was part of the estimate.
  let analysis = await getJdAnalysis(db, { userId: aiJob.userId, jdId }).catch(() => null);
  if (!analysis && analysisAiJobId) {
    await processJdAnalysis(db, { aiJobId: analysisAiJobId, jdId }, { analyze: deps.analyze, isFinalAttempt: true });
    analysis = await getJdAnalysis(db, { userId: aiJob.userId, jdId }).catch(() => null);
  }
  if (!analysis) return fail(`The job analysis didn't finish, so the resume wasn't generated${await analysisFailure(db, analysisAiJobId)}`);

  await db.update(aiJobs).set({ status: "running", updatedAt: new Date() }).where(and(eq(aiJobs.id, aiJob.id), eq(aiJobs.status, "pending")));

  // The exact source snapshot at run time (§8.5); its content is copied, never referenced.
  const source = await getVersion(db, { userId: aiJob.userId, versionId: sourceVersionId }).catch(() => null);
  if (!source) return fail("The source resume was deleted");

  const config = await getPricingConfigByVersion(db, aiJob.pricingConfigVersion);
  if (!config) return fail(`Pricing config v${aiJob.pricingConfigVersion} not found`);
  const setting = (config.actionSettings as ActionSettings).generation;

  let result: Awaited<ReturnType<GenerateFn>>;
  try {
    const sourcePages = await sourcePageCount(db, source.resumeId).catch(() => null);
    result = await deps.generate({ source: source.content, analysis, model: aiJob.model ?? setting.model, maxOutputTokens: setting.maxOutputTokens, sourcePages });
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable === true;
    if (retryable && !deps.isFinalAttempt) throw err;
    // Grounding failures land here with their rule counts in the message (§8.3: logged for admin review).
    return fail(err instanceof Error ? err.message : String(err));
  }

  // Defence in depth: never save something that isn't a valid resume.
  const content = resumeSchema.parse(result.resume);
  const firstAttemptViolations = result.firstAttemptViolations.reduce<Record<string, number>>((acc, v) => ((acc[v.rule] = (acc[v.rule] ?? 0) + 1), acc), {});
  const meta: GenerationMeta = { aiJobId: aiJob.id, gaps: result.gaps, model: result.model, promptVersion: result.promptVersion, attempts: result.attempts, firstAttemptViolations };

  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: source.resumeId,
      kind: "generated",
      content,
      provenance: result.provenance,
      parentVersionId: source.id,
      jdId,
      contentHash: resumeContentHash(content),
      generationMeta: meta,
    })
    .returning({ id: resumeVersions.id });
  await db.update(aiJobs).set({ resultVersionId: version!.id }).where(eq(aiJobs.id, aiJob.id));
  const captured = await captureHold(db, { aiJobId: aiJob.id, usage: result.usage });
  return { status: "succeeded", versionId: version!.id, creditsCharged: captured.creditsCharged };
}

export interface GenerationStatus {
  aiJobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  analysis: "not_needed" | "pending" | "running" | "succeeded" | "failed";
  creditsHeld: number;
  creditsCharged: number | null;
  analysisCharged: number | null;
  versionId: string | null;
  error: string | null;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What the progress page shows (owner-checked). */
export async function getGenerationStatus(db: Database, input: { userId: string; aiJobId: string }): Promise<GenerationStatus | null> {
  const [job] = await db.select().from(aiJobs).where(and(eq(aiJobs.id, input.aiJobId), eq(aiJobs.userId, input.userId), eq(aiJobs.type, "generation")));
  if (!job) return null;
  const parsed = generationInputSchema.safeParse(job.input);
  let analysis: GenerationStatus["analysis"] = "not_needed";
  let analysisCharged: number | null = null;
  let label = "Tailored resume";
  if (parsed.success) {
    if (parsed.data.analysisAiJobId) {
      const [a] = await db.select({ status: aiJobs.status, charged: aiJobs.creditsCharged }).from(aiJobs).where(eq(aiJobs.id, parsed.data.analysisAiJobId));
      analysis = a?.status ?? "failed";
      analysisCharged = a?.charged ?? null;
    }
    const [jd] = await db.select({ companyName: jobDescriptions.companyName, jobTitle: jobDescriptions.jobTitle }).from(jobDescriptions).where(eq(jobDescriptions.id, parsed.data.jdId));
    label = [jd?.companyName, jd?.jobTitle].filter(Boolean).join(" · ") || label;
  }
  return {
    aiJobId: job.id,
    status: job.status,
    analysis,
    creditsHeld: job.creditsEstimated,
    creditsCharged: job.creditsCharged,
    analysisCharged,
    versionId: job.resultVersionId,
    error: job.error,
    label,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/** Why the JD-analysis job behind this run failed, so the user sees the real reason. */
async function analysisFailure(db: Database, analysisAiJobId: string | null | undefined): Promise<string> {
  if (!analysisAiJobId) return "";
  const [row] = await db.select({ error: aiJobs.error }).from(aiJobs).where(eq(aiJobs.id, analysisAiJobId)).limit(1).catch(() => []);
  return row?.error ? `: ${row.error}` : "";
}
