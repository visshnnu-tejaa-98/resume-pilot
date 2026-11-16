import { aiJobs, creditHolds, jdAnalyses, jobDescriptions, type Database } from "@resume-pilot/database";
import { jdAnalysisSchema, type ActionSettings, type JdAnalysis } from "@resume-pilot/validators";
import type { CreditEstimate, TokenUsage } from "@resume-pilot/credits";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { captureHold, estimateAction, placeHold, releaseHold } from "./credits";
import { JdNotFoundError } from "./jd";
import { getPricingConfigByVersion } from "./pricing";

/**
 * JD analysis — charged once per JD, then cached (prd.md §7.2, §3.2).
 *
 * Charging rules (§3.4, CLAUDE.md invariants):
 * - An existing `jd_analyses` row is always reused: no estimate, no hold,
 *   no second charge — ever. The unique index on `jd_id` backs this up.
 * - A hold is placed only for an estimate the user confirmed, and never
 *   larger than the amount they saw.
 * - Holds are idempotent per JD *attempt* (`jd_analysis:<jdId>:<n>`, n =
 *   failed attempts + 1). Double clicks and concurrent requests therefore
 *   collapse into one hold, while a retry after a failure gets a fresh one.
 * - Success captures the actual usage; any failure releases in full.
 */

const keyPrefix = (jdId: string) => `jd_analysis:${jdId}:`;

export class JdAnalysisEstimateChangedError extends Error {
  constructor(readonly credits: number) {
    super("The estimate changed since you confirmed it. Please review the new amount.");
    this.name = "JdAnalysisEstimateChangedError";
  }
}

/** Owner-checked JD lookup (multi-tenancy). */
async function ownedJd(db: Database, userId: string, jdId: string) {
  const [jd] = await db
    .select({ id: jobDescriptions.id, text: jobDescriptions.text, companyName: jobDescriptions.companyName, jobTitle: jobDescriptions.jobTitle })
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.id, jdId), eq(jobDescriptions.userId, userId)));
  if (!jd) throw new JdNotFoundError();
  return jd;
}

async function storedAnalysis(db: Pick<Database, "select">, jdId: string): Promise<JdAnalysis | null> {
  const [row] = await db.select().from(jdAnalyses).where(eq(jdAnalyses.jdId, jdId));
  if (!row) return null;
  return jdAnalysisSchema.parse({
    jobTitle: row.jobTitle,
    seniority: row.seniority,
    minYearsExperience: row.minYearsExperience,
    requirements: row.requirements,
    educationRequirements: row.educationRequirements ?? [],
    domainTerms: row.domainTerms ?? [],
  });
}

export type JdAnalysisStatus =
  | { state: "ready"; analysis: JdAnalysis }
  | { state: "running"; aiJobId: string; credits: number }
  | { state: "failed"; error: string | null }
  | { state: "none" };

/** What the job page shows: cached analysis, run in progress, last failure, or nothing yet. */
export async function getJdAnalysisStatus(db: Database, input: { userId: string; jdId: string }): Promise<JdAnalysisStatus> {
  await ownedJd(db, input.userId, input.jdId);
  const analysis = await storedAnalysis(db, input.jdId);
  if (analysis) return { state: "ready", analysis };

  const [latest] = await db
    .select({ id: aiJobs.id, status: aiJobs.status, error: aiJobs.error, credits: aiJobs.creditsEstimated })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, input.userId), like(aiJobs.idempotencyKey, `${keyPrefix(input.jdId)}%`)))
    .orderBy(desc(aiJobs.createdAt))
    .limit(1);
  if (!latest) return { state: "none" };
  if (latest.status === "pending" || latest.status === "running") return { state: "running", aiJobId: latest.id, credits: latest.credits };
  if (latest.status === "failed") return { state: "failed", error: latest.error };
  return { state: "none" };
}

/** Step 1 (§3.4): read-only estimate, or `cached` when the analysis already exists (free). */
export async function estimateJdAnalysis(
  db: Database,
  input: { userId: string; jdId: string },
): Promise<{ cached: true } | { cached: false; estimate: CreditEstimate }> {
  const jd = await ownedJd(db, input.userId, input.jdId);
  if (await storedAnalysis(db, jd.id)) return { cached: true };
  return { cached: false, estimate: await estimateAction(db, "jd_analysis", [jd.text]) };
}

export type StartJdAnalysisResult =
  | { status: "cached" }
  | { status: "running"; aiJobId: string; credits: number; created: boolean };

/**
 * Step 3 (§3.4): the user confirmed `confirmedCredits`. Re-estimates
 * server-side (never trusts the client's number) and refuses if the real
 * estimate is higher than what was shown. The caller enqueues the job
 * when `created` is true — or always, enqueue is idempotent per aiJobId.
 */
export async function startJdAnalysis(
  db: Database,
  input: { userId: string; jdId: string; confirmedCredits: number },
): Promise<StartJdAnalysisResult> {
  const jd = await ownedJd(db, input.userId, input.jdId);
  if (await storedAnalysis(db, jd.id)) return { status: "cached" };

  // A run already in flight for this JD: return it, never start a second one.
  const [active] = await db
    .select({ id: aiJobs.id, credits: aiJobs.creditsEstimated })
    .from(aiJobs)
    .where(
      and(eq(aiJobs.userId, input.userId), like(aiJobs.idempotencyKey, `${keyPrefix(jd.id)}%`), inArray(aiJobs.status, ["pending", "running"])),
    )
    .limit(1);
  if (active) return { status: "running", aiJobId: active.id, credits: active.credits, created: false };

  const estimate = await estimateAction(db, "jd_analysis", [jd.text]);
  if (estimate.credits > input.confirmedCredits) throw new JdAnalysisEstimateChangedError(estimate.credits);

  const [failed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiJobs)
    .where(and(eq(aiJobs.userId, input.userId), like(aiJobs.idempotencyKey, `${keyPrefix(jd.id)}%`), eq(aiJobs.status, "failed")));
  const attempt = (failed?.n ?? 0) + 1;

  // placeHold locks the wallet row and dedupes on the key, so concurrent
  // requests for the same attempt get the same hold (InsufficientCreditsError
  // propagates when the balance can't cover it).
  const hold = await placeHold(db, { userId: input.userId, idempotencyKey: `${keyPrefix(jd.id)}${attempt}`, estimate });
  return { status: "running", aiJobId: hold.aiJobId, credits: hold.credits, created: hold.created };
}

export interface JdAnalyzeFn {
  (input: {
    jdText: string;
    companyName: string | null;
    jobTitle: string | null;
    model: string;
    maxOutputTokens: number;
  }): Promise<{ analysis: JdAnalysis; usage: TokenUsage }>;
}

export type ProcessJdAnalysisResult =
  | { status: "succeeded"; creditsCharged: number }
  | { status: "cached" }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

/**
 * Worker side: run the analysis under the hold placed by startJdAnalysis.
 * Errors flagged `retryable` are re-thrown for a queue retry unless it's
 * the final attempt; everything else releases the hold in full.
 */
export async function processJdAnalysis(
  db: Database,
  job: { aiJobId: string; jdId: string },
  deps: { analyze: JdAnalyzeFn; isFinalAttempt: boolean },
): Promise<ProcessJdAnalysisResult> {
  const [row] = await db
    .select({ job: aiJobs, holdStatus: creditHolds.status })
    .from(aiJobs)
    .innerJoin(creditHolds, eq(creditHolds.aiJobId, aiJobs.id))
    .where(eq(aiJobs.id, job.aiJobId));
  if (!row) return { status: "skipped", reason: "AI job not found" };
  const aiJob = row.job;
  if (aiJob.type !== "jd_analysis" || !aiJob.idempotencyKey.startsWith(keyPrefix(job.jdId))) {
    return { status: "skipped", reason: "job does not belong to this JD" };
  }
  if (aiJob.status === "succeeded" || aiJob.status === "failed") return { status: "skipped", reason: `already ${aiJob.status}` };
  if (row.holdStatus !== "active") {
    await releaseHold(db, { aiJobId: aiJob.id, reason: `hold ${row.holdStatus} before the run started` });
    return { status: "skipped", reason: `hold ${row.holdStatus}` };
  }

  const fail = async (reason: string): Promise<ProcessJdAnalysisResult> => {
    await releaseHold(db, { aiJobId: aiJob.id, reason });
    return { status: "failed", reason };
  };

  // Owner-checked: the JD must belong to the job's user.
  const jd = await ownedJd(db, aiJob.userId, job.jdId).catch(() => null);
  if (!jd) return fail("Job description not found");

  // Someone else's run finished first (shouldn't happen given the guards): never charge twice.
  if (await storedAnalysis(db, jd.id)) {
    await releaseHold(db, { aiJobId: aiJob.id, reason: "analysis already exists" });
    return { status: "cached" };
  }

  await db
    .update(aiJobs)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(aiJobs.id, aiJob.id), eq(aiJobs.status, "pending")));

  // Model + output cap from the exact pricing version the estimate used,
  // so actual cost can't exceed the hold (§3.4 step 4).
  const config = await getPricingConfigByVersion(db, aiJob.pricingConfigVersion);
  if (!config) return fail(`Pricing config v${aiJob.pricingConfigVersion} not found`);
  const setting = (config.actionSettings as ActionSettings).jd_analysis;

  let result: Awaited<ReturnType<JdAnalyzeFn>>;
  try {
    result = await deps.analyze({
      jdText: jd.text,
      companyName: jd.companyName,
      jobTitle: jd.jobTitle,
      model: aiJob.model ?? setting.model,
      maxOutputTokens: setting.maxOutputTokens,
    });
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable === true;
    const message = err instanceof Error ? err.message : String(err);
    if (retryable && !deps.isFinalAttempt) throw err;
    return fail(message);
  }

  // Unique on jd_id: if a parallel run somehow won, keep theirs and don't charge.
  const inserted = await db
    .insert(jdAnalyses)
    .values({
      jdId: jd.id,
      jobTitle: result.analysis.jobTitle,
      seniority: result.analysis.seniority,
      minYearsExperience: result.analysis.minYearsExperience,
      requirements: result.analysis.requirements,
      educationRequirements: result.analysis.educationRequirements,
      domainTerms: result.analysis.domainTerms,
    })
    .onConflictDoNothing({ target: jdAnalyses.jdId })
    .returning({ id: jdAnalyses.id });
  if (inserted.length === 0) {
    await releaseHold(db, { aiJobId: aiJob.id, reason: "analysis already exists" });
    return { status: "cached" };
  }

  const captured = await captureHold(db, { aiJobId: aiJob.id, usage: result.usage });
  return { status: "succeeded", creditsCharged: captured.creditsCharged };
}

/** Cached analysis for generation / scoring / comparison (§7.2). Never charges. */
export async function getJdAnalysis(db: Database, input: { userId: string; jdId: string }): Promise<JdAnalysis | null> {
  await ownedJd(db, input.userId, input.jdId);
  return storedAnalysis(db, input.jdId);
}
