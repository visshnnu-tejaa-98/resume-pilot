import { aiJobs, atsReports, creditHolds, jobDescriptions, resumes, resumeVersions, type Database } from "@resume-pilot/database";
import type { ActionSettings, JdAnalysis } from "@resume-pilot/validators";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import type { TokenUsage } from "@resume-pilot/credits";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { captureHold, estimateAction, placeHold, releaseHold } from "./credits";
import { JdNotFoundError } from "./jd";
import { estimateJdAnalysis, getJdAnalysis, processJdAnalysis, startJdAnalysis, type JdAnalyzeFn } from "./jd-analysis";
import { getPricingConfigByVersion } from "./pricing";

/**
 * ATS scoring — prd.md §9, charged per §3.2/§3.4.
 *
 * Cache (§9.3, 16.2.6): key = resume content hash + JD id (+ scoring
 * method version). A hit is free — no estimate, no hold, no AI call.
 * A report is "current" while its hash equals the version's content
 * hash; any edit makes it outdated, and re-scoring adds a new report so
 * history is kept (16.2.10).
 *
 * The scoring computation itself is injected (`score`), so this module
 * stays free of AI code; the worker passes packages/ai's evaluate +
 * computeScore.
 */

export class ScoringError extends Error {
  constructor(
    readonly code: "not_found" | "estimate_changed",
    message: string,
    readonly credits?: number,
  ) {
    super(message);
    this.name = "ScoringError";
  }
}

export const scoringInputSchema = z.object({
  versionId: z.uuid(),
  jdId: z.uuid(),
  analysisAiJobId: z.uuid().nullable(),
  /** Set when the run finishes (or hits the cache). */
  reportId: z.uuid().optional(),
});
export type ScoringInput = z.infer<typeof scoringInputSchema>;

/** What the injected scorer returns: the stored report pieces + token usage. */
export interface ScoreFn {
  (input: { resume: Resume; analysis: JdAnalysis; model: string; maxOutputTokens: number; asOf: Date }): Promise<{
    overallScore: number;
    breakdown: unknown;
    report: object;
    usage: TokenUsage;
  }>;
}

async function ownedVersion(db: Pick<Database, "select">, userId: string, versionId: string) {
  const [v] = await db
    .select({ id: resumeVersions.id, content: resumeVersions.content, contentHash: resumeVersions.contentHash, kind: resumeVersions.kind, fileName: resumes.fileName, jdId: resumeVersions.jdId })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(and(eq(resumeVersions.id, versionId), eq(resumes.userId, userId)));
  if (!v) throw new ScoringError("not_found", "That resume version isn't available");
  return v;
}

async function ownedJd(db: Database, userId: string, jdId: string) {
  const [jd] = await db.select({ id: jobDescriptions.id, text: jobDescriptions.text }).from(jobDescriptions).where(and(eq(jobDescriptions.id, jdId), eq(jobDescriptions.userId, userId)));
  if (!jd) throw new JdNotFoundError();
  return jd;
}

/**
 * Cached report for this content + JD. Prefers this version's own report;
 * otherwise copies one from another of the user's versions with identical
 * content (e.g. a duplicate) — still free, never re-run.
 */
async function findCached(db: Database, input: { userId: string; versionId: string; jdId: string; contentHash: string; methodVersion: string }): Promise<string | null> {
  const [own] = await db
    .select({ id: atsReports.id })
    .from(atsReports)
    .where(and(eq(atsReports.versionId, input.versionId), eq(atsReports.jdId, input.jdId), eq(atsReports.contentHash, input.contentHash), eq(atsReports.methodVersion, input.methodVersion)))
    .orderBy(desc(atsReports.createdAt))
    .limit(1);
  if (own) return own.id;

  const [twin] = await db
    .select({ r: atsReports })
    .from(atsReports)
    .innerJoin(resumeVersions, eq(resumeVersions.id, atsReports.versionId))
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(and(eq(resumes.userId, input.userId), eq(atsReports.jdId, input.jdId), eq(atsReports.contentHash, input.contentHash), eq(atsReports.methodVersion, input.methodVersion)))
    .orderBy(desc(atsReports.createdAt))
    .limit(1);
  if (!twin) return null;
  const { id: _id, createdAt: _c, ...copy } = twin.r;
  const [row] = await db.insert(atsReports).values({ ...copy, versionId: input.versionId, status: "current" }).returning({ id: atsReports.id });
  return row!.id;
}

export interface ScoringEstimate {
  cached: false;
  lines: { action: "jd_analysis" | "ats_scoring"; credits: number }[];
  total: number;
}

/** Step 1 (§3.4). `cached` → free, nothing to confirm. */
export async function estimateScoring(
  db: Database,
  input: { userId: string; versionId: string; jdId: string; methodVersion: string },
): Promise<{ cached: true; reportId: string } | ScoringEstimate> {
  const v = await ownedVersion(db, input.userId, input.versionId);
  const jd = await ownedJd(db, input.userId, input.jdId);
  const cached = await findCached(db, { ...input, contentHash: v.contentHash });
  if (cached) return { cached: true, reportId: cached };
  const lines: ScoringEstimate["lines"] = [];
  const a = await estimateJdAnalysis(db, { userId: input.userId, jdId: jd.id });
  if (!a.cached) lines.push({ action: "jd_analysis", credits: a.estimate.credits });
  const s = await estimateAction(db, "ats_scoring", [JSON.stringify(v.content), jd.text]);
  lines.push({ action: "ats_scoring", credits: s.credits });
  return { cached: false, lines, total: lines.reduce((n, l) => n + l.credits, 0) };
}

export type StartScoringResult =
  | { status: "cached"; reportId: string }
  | { status: "running"; aiJobId: string; analysisAiJobId: string | null; created: boolean; analysisCreated: boolean };

/** Step 3: on Confirm. Never holds above `confirmedCredits`; idempotent per `requestId`. */
export async function startScoring(
  db: Database,
  input: { userId: string; versionId: string; jdId: string; methodVersion: string; confirmedCredits: number; requestId: string },
): Promise<StartScoringResult> {
  const key = `ats_scoring:${input.userId}:${input.requestId}`;
  const [existing] = await db.select({ id: aiJobs.id, input: aiJobs.input }).from(aiJobs).where(eq(aiJobs.idempotencyKey, key));
  if (existing) {
    const p = scoringInputSchema.safeParse(existing.input);
    return { status: "running", aiJobId: existing.id, analysisAiJobId: p.success ? p.data.analysisAiJobId : null, created: false, analysisCreated: false };
  }

  const est = await estimateScoring(db, input);
  if (est.cached) return { status: "cached", reportId: est.reportId };
  if (est.total > input.confirmedCredits) throw new ScoringError("estimate_changed", "The estimate changed since you confirmed it. Please review the new amount.", est.total);

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

  const v = await ownedVersion(db, input.userId, input.versionId);
  const jd = await ownedJd(db, input.userId, input.jdId);
  const estimate = await estimateAction(db, "ats_scoring", [JSON.stringify(v.content), jd.text]);
  try {
    const hold = await placeHold(db, { userId: input.userId, idempotencyKey: key, estimate });
    const jobInput: ScoringInput = { versionId: input.versionId, jdId: input.jdId, analysisAiJobId };
    await db.update(aiJobs).set({ input: jobInput }).where(eq(aiJobs.id, hold.aiJobId));
    return { status: "running", aiJobId: hold.aiJobId, analysisAiJobId, created: hold.created, analysisCreated };
  } catch (err) {
    if (analysisCreated && analysisAiJobId) await releaseHold(db, { aiJobId: analysisAiJobId, reason: "scoring could not be started" });
    throw err;
  }
}

export type ProcessScoringResult =
  | { status: "succeeded"; reportId: string; creditsCharged: number }
  | { status: "cached"; reportId: string }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

/** Worker side of a scoring job. */
export async function processScoring(
  db: Database,
  job: { aiJobId: string },
  deps: { score: ScoreFn; analyze: JdAnalyzeFn; isFinalAttempt: boolean; methodVersion: string; now?: Date },
): Promise<ProcessScoringResult> {
  const [row] = await db.select({ job: aiJobs, holdStatus: creditHolds.status }).from(aiJobs).innerJoin(creditHolds, eq(creditHolds.aiJobId, aiJobs.id)).where(eq(aiJobs.id, job.aiJobId));
  if (!row || row.job.type !== "ats_scoring") return { status: "skipped", reason: "scoring job not found" };
  const aiJob = row.job;
  if (aiJob.status === "succeeded" || aiJob.status === "failed") return { status: "skipped", reason: `already ${aiJob.status}` };
  if (row.holdStatus !== "active") {
    await releaseHold(db, { aiJobId: aiJob.id, reason: `hold ${row.holdStatus} before the run started` });
    return { status: "skipped", reason: `hold ${row.holdStatus}` };
  }
  const fail = async (reason: string): Promise<ProcessScoringResult> => {
    await releaseHold(db, { aiJobId: aiJob.id, reason });
    return { status: "failed", reason };
  };
  const parsed = scoringInputSchema.safeParse(aiJob.input);
  if (!parsed.success) return fail("Scoring input missing");
  const input = parsed.data;
  const setReport = (reportId: string) => db.update(aiJobs).set({ input: { ...input, reportId } satisfies ScoringInput }).where(eq(aiJobs.id, aiJob.id));

  let analysis = await getJdAnalysis(db, { userId: aiJob.userId, jdId: input.jdId }).catch(() => null);
  if (!analysis && input.analysisAiJobId) {
    await processJdAnalysis(db, { aiJobId: input.analysisAiJobId, jdId: input.jdId }, { analyze: deps.analyze, isFinalAttempt: true });
    analysis = await getJdAnalysis(db, { userId: aiJob.userId, jdId: input.jdId }).catch(() => null);
  }
  if (!analysis) return fail(`The job analysis didn't finish, so the resume wasn't scored${await analysisFailure(db, input.analysisAiJobId)}`);

  const v = await ownedVersion(db, aiJob.userId, input.versionId).catch(() => null);
  if (!v) return fail("The resume version was deleted");

  // Someone scored identical content meanwhile: free, release the hold.
  const cached = await findCached(db, { userId: aiJob.userId, versionId: v.id, jdId: input.jdId, contentHash: v.contentHash, methodVersion: deps.methodVersion });
  if (cached) {
    await releaseHold(db, { aiJobId: aiJob.id, reason: "report already cached" });
    await setReport(cached);
    return { status: "cached", reportId: cached };
  }

  await db.update(aiJobs).set({ status: "running", updatedAt: new Date() }).where(and(eq(aiJobs.id, aiJob.id), eq(aiJobs.status, "pending")));
  const config = await getPricingConfigByVersion(db, aiJob.pricingConfigVersion);
  if (!config) return fail(`Pricing config v${aiJob.pricingConfigVersion} not found`);
  const setting = (config.actionSettings as ActionSettings).ats_scoring;

  let result: Awaited<ReturnType<ScoreFn>>;
  try {
    result = await deps.score({ resume: resumeSchema.parse(v.content), analysis, model: aiJob.model ?? setting.model, maxOutputTokens: setting.maxOutputTokens, asOf: deps.now ?? new Date() });
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable === true;
    if (retryable && !deps.isFinalAttempt) throw err;
    return fail(err instanceof Error ? err.message : String(err));
  }

  const [report] = await db
    .insert(atsReports)
    .values({
      versionId: v.id,
      jdId: input.jdId,
      contentHash: v.contentHash,
      methodVersion: deps.methodVersion,
      overallScore: result.overallScore,
      breakdown: result.breakdown,
      report: { ...result.report, aiJobId: aiJob.id },
      status: "current",
    })
    .returning({ id: atsReports.id });
  // Older reports for this version + JD on different content are history now.
  await db.update(atsReports).set({ status: "outdated" }).where(and(eq(atsReports.versionId, v.id), eq(atsReports.jdId, input.jdId), ne(atsReports.contentHash, v.contentHash)));
  await setReport(report!.id);
  const captured = await captureHold(db, { aiJobId: aiJob.id, usage: result.usage });
  return { status: "succeeded", reportId: report!.id, creditsCharged: captured.creditsCharged };
}

export interface ScoringStatus {
  aiJobId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  versionId: string | null;
  jdId: string | null;
  reportId: string | null;
  error: string | null;
}

export async function getScoringStatus(db: Database, input: { userId: string; aiJobId: string }): Promise<ScoringStatus | null> {
  const [j] = await db.select().from(aiJobs).where(and(eq(aiJobs.id, input.aiJobId), eq(aiJobs.userId, input.userId), eq(aiJobs.type, "ats_scoring")));
  if (!j) return null;
  const p = scoringInputSchema.safeParse(j.input);
  // A run that hit the cache releases its hold (job "failed") but has a report.
  const reportId = p.success ? (p.data.reportId ?? null) : null;
  return { aiJobId: j.id, status: reportId ? "succeeded" : j.status, versionId: p.success ? p.data.versionId : null, jdId: p.success ? p.data.jdId : null, reportId, error: reportId ? null : j.error };
}

const reportCols = {
  id: atsReports.id,
  versionId: atsReports.versionId,
  jdId: atsReports.jdId,
  contentHash: atsReports.contentHash,
  methodVersion: atsReports.methodVersion,
  overallScore: atsReports.overallScore,
  breakdown: atsReports.breakdown,
  report: atsReports.report,
  createdAt: atsReports.createdAt,
  versionHash: resumeVersions.contentHash,
  companyName: jobDescriptions.companyName,
  jobTitle: jobDescriptions.jobTitle,
};

function ownedReports(db: Database, userId: string) {
  return db
    .select(reportCols)
    .from(atsReports)
    .innerJoin(resumeVersions, eq(resumeVersions.id, atsReports.versionId))
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .innerJoin(jobDescriptions, eq(jobDescriptions.id, atsReports.jdId))
    .$dynamic()
    .where(eq(resumes.userId, userId));
}

type ReportRow = Awaited<ReturnType<typeof ownedReports>>[number];
const withOutdated = (r: ReportRow) => ({ ...r, outdated: r.contentHash !== r.versionHash });
export type AtsReportRecord = ReturnType<typeof withOutdated>;

export async function getReport(db: Database, input: { userId: string; reportId: string }): Promise<AtsReportRecord | null> {
  const [r] = await ownedReports(db, input.userId).where(and(eq(resumes.userId, input.userId), eq(atsReports.id, input.reportId)));
  return r ? withOutdated(r) : null;
}

/** Score history for a version (newest first), optionally for one JD. */
export async function listVersionReports(db: Database, input: { userId: string; versionId: string; jdId?: string }): Promise<AtsReportRecord[]> {
  const rows = await ownedReports(db, input.userId)
    .where(and(eq(resumes.userId, input.userId), eq(atsReports.versionId, input.versionId), input.jdId ? eq(atsReports.jdId, input.jdId) : undefined))
    .orderBy(desc(atsReports.createdAt));
  return rows.map(withOutdated);
}

/** The current (non-outdated) report for content + JD, if any. Read-only, free. */
export async function currentReport(db: Database, input: { userId: string; versionId: string; jdId: string; methodVersion: string }): Promise<AtsReportRecord | null> {
  const v = await ownedVersion(db, input.userId, input.versionId);
  const [r] = await ownedReports(db, input.userId)
    .where(and(eq(resumes.userId, input.userId), eq(atsReports.versionId, v.id), eq(atsReports.jdId, input.jdId), eq(atsReports.contentHash, v.contentHash), eq(atsReports.methodVersion, input.methodVersion)))
    .orderBy(desc(atsReports.createdAt))
    .limit(1);
  return r ? withOutdated(r) : null;
}

/** §9.4: what Compare needs to run — only sides without a current report cost anything. */
export async function estimateCompare(
  db: Database,
  input: { userId: string; aVersionId: string; bVersionId: string; jdId: string; methodVersion: string },
): Promise<{ sides: Record<"a" | "b", { cached: true; reportId: string } | { cached: false; credits: number }>; analysisCredits: number; total: number }> {
  const a = await estimateScoring(db, { userId: input.userId, versionId: input.aVersionId, jdId: input.jdId, methodVersion: input.methodVersion });
  const b = await estimateScoring(db, { userId: input.userId, versionId: input.bVersionId, jdId: input.jdId, methodVersion: input.methodVersion });
  const side = (e: typeof a) => (e.cached ? { cached: true as const, reportId: e.reportId } : { cached: false as const, credits: e.lines.find((l) => l.action === "ats_scoring")!.credits });
  // The JD analysis is shared: counted once.
  const analysisCredits = [a, b].map((e) => (e.cached ? 0 : (e.lines.find((l) => l.action === "jd_analysis")?.credits ?? 0))).reduce((m, n) => Math.max(m, n), 0);
  const sides = { a: side(a), b: side(b) };
  const total = analysisCredits + (sides.a.cached ? 0 : sides.a.credits) + (sides.b.cached ? 0 : sides.b.credits);
  return { sides, analysisCredits, total };
}

/** Starts scoring for each side that needs it; cached sides cost nothing. */
export async function startCompare(
  db: Database,
  input: { userId: string; aVersionId: string; bVersionId: string; jdId: string; methodVersion: string; confirmedCredits: number; requestId: string },
): Promise<Record<"a" | "b", StartScoringResult>> {
  const est = await estimateCompare(db, input);
  if (est.total > input.confirmedCredits) throw new ScoringError("estimate_changed", "The estimate changed since you confirmed it. Please review the new amount.", est.total);
  const run = async (side: "a" | "b", versionId: string): Promise<StartScoringResult> => {
    const s = est.sides[side];
    if (s.cached) return { status: "cached", reportId: s.reportId };
    const fresh = await estimateScoring(db, { userId: input.userId, versionId, jdId: input.jdId, methodVersion: input.methodVersion });
    return startScoring(db, { userId: input.userId, versionId, jdId: input.jdId, methodVersion: input.methodVersion, confirmedCredits: fresh.cached ? 0 : fresh.total, requestId: `${input.requestId}:${side}` });
  };
  // Sequential: the second side then sees the JD analysis hold the first placed.
  const a = await run("a", input.aVersionId);
  const b = await run("b", input.bVersionId);
  return { a, b };
}

/** Why the JD-analysis job behind this run failed, so the user sees the real reason. */
async function analysisFailure(db: Database, analysisAiJobId: string | null | undefined): Promise<string> {
  if (!analysisAiJobId) return "";
  const [row] = await db.select({ error: aiJobs.error }).from(aiJobs).where(eq(aiJobs.id, analysisAiJobId)).limit(1).catch(() => []);
  return row?.error ? `: ${row.error}` : "";
}
