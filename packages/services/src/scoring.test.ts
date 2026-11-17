import { randomUUID } from "node:crypto";
import { buildReport, scoreResume, SCORE_DISCLAIMER, SCORING_METHOD_VERSION, type ResponsesClient, type ScoringEvaluation, type StoredReport } from "@resume-pilot/ai";
import { JD_ANALYSES, RESUMES } from "@resume-pilot/ai/fixtures";
import { atsReports, createDatabase, creditAccounts, creditLedger, jdAnalyses, resumes, resumeVersions, users, type Database } from "@resume-pilot/database";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getWalletBalance } from "./credits";
import { createJobDescription } from "./jd";
import type { JdAnalyzeFn } from "./jd-analysis";
import { estimateCompare, estimateScoring, getReport, getScoringStatus, listVersionReports, processScoring, startCompare, startScoring, type ScoreFn } from "./scoring";
import { resumeContentHash } from "./structuring";
import { createUserFromClerkWebhook } from "./user";
import { duplicateVersion, getVersion, saveVersionContent } from "./versions";

const connectionString = process.env.DATABASE_URL;
const M = SCORING_METHOD_VERSION;
const SOURCE = RESUMES.frontend!;
const ANALYSIS = JD_ANALYSES.fe!;
const JD_TEXT = "We are hiring a Frontend Engineer with 4+ years of React and TypeScript to build our design system. ".repeat(4);
const EVALUATION: ScoringEvaluation = {
  requirements: [
    { requirementId: "r1", status: "matched", evidenceIds: ["b_1"], reason: "React design system" },
    { requirementId: "r2", status: "matched", evidenceIds: ["b_1"], reason: "TypeScript" },
    { requirementId: "r3", status: "missing", evidenceIds: [], reason: "No GraphQL" },
  ],
  assessment: "Strong fit; GraphQL missing.",
  recommendations: [{ area: "summary", title: "Lead with React", detail: "It's the first requirement." }],
};

const fakeModel = (): ResponsesClient => ({
  responses: { create: async () => ({ status: "completed", output: [], output_text: JSON.stringify(EVALUATION), usage: { input_tokens: 2500, output_tokens: 500 } }) as never },
});
const realScore = (): ScoreFn & { calls: number } => {
  const fn = (async (input: Parameters<ScoreFn>[0]) => {
    fn.calls++;
    return scoreResume(fakeModel(), input);
  }) as ScoreFn & { calls: number };
  fn.calls = 0;
  return fn;
};
const analyze: JdAnalyzeFn = async () => ({ analysis: ANALYSIS, usage: { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 0 } });

describe.skipIf(!connectionString)("ATS scoring, cache, history, compare (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function setup(opts: { analysed?: boolean } = {}) {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `ats-${randomUUID()}@example.com` });
    userIds.push(userId);
    await db.update(creditAccounts).set({ balance: 100_000 }).where(eq(creditAccounts.userId, userId));
    const [resume] = await db.insert(resumes).values({ userId, fileKey: `k/${randomUUID()}`, fileName: "asha.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    const [original] = await db.insert(resumeVersions).values({ resumeId: resume!.id, kind: "original", content: SOURCE, contentHash: resumeContentHash(SOURCE), extractionMeta: {} }).returning();
    const [gen] = await db
      .insert(resumeVersions)
      .values({ resumeId: resume!.id, kind: "generated", content: SOURCE, contentHash: resumeContentHash(SOURCE), parentVersionId: original!.id, generationMeta: {} })
      .returning();
    const jd = await createJobDescription(db, userId, { text: JD_TEXT, companyName: "Acme", jobTitle: "Frontend Engineer" });
    if (opts.analysed !== false) await db.insert(jdAnalyses).values({ jdId: jd.id, jobTitle: ANALYSIS.jobTitle, seniority: null, minYearsExperience: ANALYSIS.minYearsExperience, requirements: ANALYSIS.requirements, educationRequirements: [], domainTerms: [] });
    return { userId, originalId: original!.id, genId: gen!.id, jdId: jd.id };
  }

  async function score(s: { userId: string; jdId: string }, versionId: string, scoreFn = realScore()) {
    const est = await estimateScoring(db, { userId: s.userId, versionId, jdId: s.jdId, methodVersion: M });
    if (est.cached) return { est, start: { status: "cached" as const, reportId: est.reportId }, result: null, scoreFn };
    const start = await startScoring(db, { userId: s.userId, versionId, jdId: s.jdId, methodVersion: M, confirmedCredits: est.total, requestId: randomUUID() });
    if (start.status !== "running") return { est, start, result: null, scoreFn };
    const result = await processScoring(db, { aiJobId: start.aiJobId }, { score: scoreFn, analyze, isFinalAttempt: true, methodVersion: M, now: new Date("2026-11-17T00:00:00Z") });
    return { est, start, result, scoreFn };
  }
  const captures = (userId: string) => db.select().from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "capture")));

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it("first score: holds, saves a current report with the disclaimer and all inputs, captures ≤ estimate", async () => {
    const s = await setup();
    const { est, result } = await score(s, s.genId);
    expect(result?.status).toBe("succeeded");
    if (result?.status !== "succeeded" || est.cached) return;
    const r = (await getReport(db, { userId: s.userId, reportId: result.reportId }))!;
    expect(r.outdated).toBe(false);
    const stored = r.report as StoredReport;
    expect(stored.disclaimer).toBe(SCORE_DISCLAIMER);
    expect(stored.inputs.evaluation).toEqual(EVALUATION);
    expect(r.methodVersion).toBe(M);
    const [c] = await captures(s.userId);
    expect(-c!.credits).toBeLessThanOrEqual(est.total);
    expect((await getWalletBalance(db, s.userId)).held).toBe(0);
  });

  it("DONE WHEN (01): the stored inputs always reproduce the stored score", async () => {
    const s = await setup();
    const { result } = await score(s, s.genId);
    if (result?.status !== "succeeded") throw new Error("expected success");
    const r = (await getReport(db, { userId: s.userId, reportId: result.reportId }))!;
    const stored = r.report as StoredReport;
    const v = await getVersion(db, { userId: s.userId, versionId: s.genId });
    const again = buildReport({ resume: v.content, analysis: stored.inputs.analysis, evaluation: stored.inputs.evaluation, asOf: new Date(stored.asOf), model: stored.model, promptVersion: stored.promptVersion });
    expect(again.overallScore).toBe(r.overallScore);
    expect(again.breakdown).toEqual(r.breakdown);
  });

  it("16.2.6: unchanged content + same JD returns the cached report at zero cost, no AI call", async () => {
    const s = await setup();
    const first = await score(s, s.genId);
    if (first.result?.status !== "succeeded") throw new Error("expected success");
    const before = (await getWalletBalance(db, s.userId)).balance;
    const second = await score(s, s.genId);
    expect(second.est).toEqual({ cached: true, reportId: first.result.reportId });
    expect(second.scoreFn.calls).toBe(0);
    expect(await startScoring(db, { userId: s.userId, versionId: s.genId, jdId: s.jdId, methodVersion: M, confirmedCredits: 1, requestId: randomUUID() })).toEqual({ status: "cached", reportId: first.result.reportId });
    expect((await getWalletBalance(db, s.userId)).balance).toBe(before);
    expect(await captures(s.userId)).toHaveLength(1);
  });

  it("16.2.10: an edit flips the report to Outdated; re-scoring adds a new report and keeps history", async () => {
    const s = await setup();
    const first = await score(s, s.genId);
    if (first.result?.status !== "succeeded") throw new Error("expected success");
    const v = await getVersion(db, { userId: s.userId, versionId: s.genId });
    const edited = structuredClone(v.content);
    edited.summary.text = "Frontend engineer focused on React design systems.";
    await saveVersionContent(db, { userId: s.userId, versionId: s.genId, content: edited });

    expect((await getReport(db, { userId: s.userId, reportId: first.result.reportId }))!.outdated).toBe(true);
    const [row] = await db.select({ status: atsReports.status }).from(atsReports).where(eq(atsReports.id, first.result.reportId));
    expect(row!.status).toBe("outdated");
    expect((await estimateScoring(db, { userId: s.userId, versionId: s.genId, jdId: s.jdId, methodVersion: M })).cached).toBe(false);

    const second = await score(s, s.genId);
    expect(second.result?.status).toBe("succeeded");
    const history = await listVersionReports(db, { userId: s.userId, versionId: s.genId });
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.outdated)).toEqual([false, true]);
    expect(await captures(s.userId)).toHaveLength(2);
  });

  it("identical content in another version (a duplicate) reuses the report for free", async () => {
    const s = await setup();
    const first = await score(s, s.genId);
    if (first.result?.status !== "succeeded") throw new Error("expected success");
    const dup = await duplicateVersion(db, { userId: s.userId, versionId: s.genId });
    const est = await estimateScoring(db, { userId: s.userId, versionId: dup.versionId, jdId: s.jdId, methodVersion: M });
    expect(est.cached).toBe(true);
    expect(await captures(s.userId)).toHaveLength(1);
  });

  it("an un-analysed JD: analysis runs first, both captured", async () => {
    const s = await setup({ analysed: false });
    const { est, result } = await score(s, s.genId);
    expect(!est.cached && est.lines.map((l) => l.action)).toEqual(["jd_analysis", "ats_scoring"]);
    expect(result?.status).toBe("succeeded");
    expect(await captures(s.userId)).toHaveLength(2);
  });

  it("a failed run releases the hold and saves nothing", async () => {
    const s = await setup();
    const boom = vi.fn(async () => {
      throw Object.assign(new Error("model refused"), { retryable: false });
    }) as unknown as ScoreFn;
    const { start, result } = await score(s, s.genId, boom as never);
    expect(result?.status).toBe("failed");
    expect((await getWalletBalance(db, s.userId)).held).toBe(0);
    expect(await listVersionReports(db, { userId: s.userId, versionId: s.genId })).toHaveLength(0);
    if (start.status === "running") expect((await getScoringStatus(db, { userId: s.userId, aiJobId: start.aiJobId }))?.status).toBe("failed");
  });

  it("16.2.11 compare: both cached → 0 credits; one side missing → only that side is estimated and charged", async () => {
    const s = await setup();
    await score(s, s.genId);
    // original has identical content in this fixture → twin cache; make it differ first.
    const orig = await getVersion(db, { userId: s.userId, versionId: s.originalId });
    const changed = structuredClone(orig.content);
    changed.summary.text = "Different original summary.";
    await db.update(resumeVersions).set({ content: changed, contentHash: resumeContentHash(changed) }).where(eq(resumeVersions.id, s.originalId));

    const est = await estimateCompare(db, { userId: s.userId, aVersionId: s.originalId, bVersionId: s.genId, jdId: s.jdId, methodVersion: M });
    expect(est.sides.b.cached).toBe(true);
    expect(est.sides.a.cached).toBe(false);
    expect(est.analysisCredits).toBe(0);
    expect(est.total).toBe(est.sides.a.cached ? 0 : est.sides.a.credits);

    const started = await startCompare(db, { userId: s.userId, aVersionId: s.originalId, bVersionId: s.genId, jdId: s.jdId, methodVersion: M, confirmedCredits: est.total, requestId: randomUUID() });
    expect(started.b.status).toBe("cached");
    if (started.a.status !== "running") throw new Error("expected a to run");
    await processScoring(db, { aiJobId: started.a.aiJobId }, { score: realScore(), analyze, isFinalAttempt: true, methodVersion: M });

    const after = await estimateCompare(db, { userId: s.userId, aVersionId: s.originalId, bVersionId: s.genId, jdId: s.jdId, methodVersion: M });
    expect(after.total).toBe(0);
    expect(after.sides.a.cached && after.sides.b.cached).toBe(true);
  });

  it("other users can't estimate, start or read someone else's reports", async () => {
    const s = await setup();
    const first = await score(s, s.genId);
    if (first.result?.status !== "succeeded") throw new Error("expected success");
    const other = await setup();
    await expect(estimateScoring(db, { userId: other.userId, versionId: s.genId, jdId: other.jdId, methodVersion: M })).rejects.toThrow();
    expect(await getReport(db, { userId: other.userId, reportId: first.result.reportId })).toBeNull();
    expect(await listVersionReports(db, { userId: other.userId, versionId: s.genId })).toEqual([]);
  });
});
