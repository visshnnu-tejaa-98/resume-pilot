import { randomUUID } from "node:crypto";
import { aiJobs, createDatabase, creditAccounts, creditLedger, users, type Database } from "@resume-pilot/database";
import type { JdAnalysis } from "@resume-pilot/validators";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getWalletBalance, InsufficientCreditsError } from "./credits";
import { createJobDescription } from "./jd";
import {
  estimateJdAnalysis,
  getJdAnalysisStatus,
  JdAnalysisEstimateChangedError,
  processJdAnalysis,
  startJdAnalysis,
  type JdAnalyzeFn,
} from "./jd-analysis";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

const ANALYSIS: JdAnalysis = {
  jobTitle: "Frontend Engineer",
  seniority: "Mid",
  minYearsExperience: 4,
  requirements: [{ id: "r1", text: "React", type: "tool", priority: "required", keywords: ["React"], synonyms: ["React.js"] }],
  educationRequirements: [],
  domainTerms: ["design systems"],
};
const USAGE = { inputTokens: 1500, outputTokens: 400, cachedInputTokens: 0 };
const JD_TEXT = "We are hiring a Frontend Engineer with 4+ years of React and TypeScript to build our design system. ".repeat(4);

describe.skipIf(!connectionString)("JD analysis: charged once, cached (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function setup(balance = 50_000) {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `jda-${randomUUID()}@example.com` });
    userIds.push(userId);
    await db.update(creditAccounts).set({ balance }).where(eq(creditAccounts.userId, userId));
    const jd = await createJobDescription(db, userId, { text: JD_TEXT, companyName: "Acme", jobTitle: "Frontend Engineer" });
    return { userId, jdId: jd.id };
  }

  const okAnalyze = (): JdAnalyzeFn => vi.fn(async () => ({ analysis: ANALYSIS, usage: USAGE }));

  async function confirmAndRun(userId: string, jdId: string, analyze: JdAnalyzeFn = okAnalyze()) {
    const est = await estimateJdAnalysis(db, { userId, jdId });
    if (est.cached) return { start: { status: "cached" as const }, run: null };
    const start = await startJdAnalysis(db, { userId, jdId, confirmedCredits: est.estimate.credits });
    if (start.status !== "running") return { start, run: null };
    const run = await processJdAnalysis(db, { aiJobId: start.aiJobId, jdId }, { analyze, isFinalAttempt: true });
    return { start, run };
  }

  const charges = async (userId: string) =>
    db.select().from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "capture")));

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it("first run: holds, saves the analysis, captures actual usage (≤ estimate)", async () => {
    const { userId, jdId } = await setup();
    const est = await estimateJdAnalysis(db, { userId, jdId });
    expect(est.cached).toBe(false);
    const { start, run } = await confirmAndRun(userId, jdId);
    expect(start.status).toBe("running");
    expect(run?.status).toBe("succeeded");

    const ledger = await charges(userId);
    expect(ledger).toHaveLength(1);
    expect(-ledger[0]!.credits).toBeGreaterThan(0);
    expect(-ledger[0]!.credits).toBeLessThanOrEqual(est.cached ? 0 : est.estimate.credits);

    const status = await getJdAnalysisStatus(db, { userId, jdId });
    expect(status.state).toBe("ready");
    expect(status.state === "ready" && status.analysis.requirements[0]!.keywords).toEqual(["React"]);
    expect((await getWalletBalance(db, userId)).held).toBe(0);
  });

  it("DONE WHEN: re-running on an analysed JD never triggers a second charge", async () => {
    const { userId, jdId } = await setup();
    await confirmAndRun(userId, jdId);
    const analyze = okAnalyze();

    expect(await estimateJdAnalysis(db, { userId, jdId })).toEqual({ cached: true });
    expect(await startJdAnalysis(db, { userId, jdId, confirmedCredits: 99_999 })).toEqual({ status: "cached" });
    const again = await confirmAndRun(userId, jdId, analyze);
    expect(again.start.status).toBe("cached");
    expect(analyze).not.toHaveBeenCalled();
    expect(await charges(userId)).toHaveLength(1);
  });

  it("double click / concurrent confirms collapse into one hold and one charge", async () => {
    const { userId, jdId } = await setup();
    const est = await estimateJdAnalysis(db, { userId, jdId });
    if (est.cached) throw new Error("unexpected cache");
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => startJdAnalysis(db, { userId, jdId, confirmedCredits: est.estimate.credits })));
    const ids = new Set([a, b, c].map((r) => (r!.status === "running" ? r!.aiJobId : "cached")));
    expect(ids.size).toBe(1);
    expect((await getWalletBalance(db, userId)).held).toBe(est.estimate.credits);

    const aiJobId = [...ids][0]!;
    await processJdAnalysis(db, { aiJobId, jdId }, { analyze: okAnalyze(), isFinalAttempt: true });
    // A duplicate queue delivery of the same job does nothing.
    expect((await processJdAnalysis(db, { aiJobId, jdId }, { analyze: okAnalyze(), isFinalAttempt: true })).status).toBe("skipped");
    expect(await charges(userId)).toHaveLength(1);
  });

  it("failure releases the hold in full, charges 0, and a later retry gets a new hold", async () => {
    const { userId, jdId } = await setup();
    const boom: JdAnalyzeFn = async () => {
      throw Object.assign(new Error("model refused"), { retryable: false });
    };
    const first = await confirmAndRun(userId, jdId, boom);
    expect(first.run?.status).toBe("failed");
    expect(await charges(userId)).toHaveLength(0);
    expect((await getWalletBalance(db, userId)).held).toBe(0);
    expect((await getJdAnalysisStatus(db, { userId, jdId })).state).toBe("failed");

    const retry = await confirmAndRun(userId, jdId);
    expect(retry.run?.status).toBe("succeeded");
    expect(retry.start.status === "running" && first.start.status === "running" && retry.start.aiJobId).not.toBe(
      first.start.status === "running" ? first.start.aiJobId : "",
    );
    expect(await charges(userId)).toHaveLength(1);
  });

  it("retryable errors re-throw for a queue retry (hold kept) until the final attempt", async () => {
    const { userId, jdId } = await setup();
    const est = await estimateJdAnalysis(db, { userId, jdId });
    if (est.cached) throw new Error("unexpected cache");
    const start = await startJdAnalysis(db, { userId, jdId, confirmedCredits: est.estimate.credits });
    if (start.status !== "running") throw new Error("expected running");
    const flaky: JdAnalyzeFn = async () => {
      throw Object.assign(new Error("HTTP 503"), { retryable: true });
    };
    await expect(processJdAnalysis(db, { aiJobId: start.aiJobId, jdId }, { analyze: flaky, isFinalAttempt: false })).rejects.toThrow("503");
    expect((await getWalletBalance(db, userId)).held).toBe(est.estimate.credits);
    const last = await processJdAnalysis(db, { aiJobId: start.aiJobId, jdId }, { analyze: flaky, isFinalAttempt: true });
    expect(last.status).toBe("failed");
    expect((await getWalletBalance(db, userId)).held).toBe(0);
  });

  it("never holds more than the estimate the user saw", async () => {
    const { userId, jdId } = await setup();
    await expect(startJdAnalysis(db, { userId, jdId, confirmedCredits: 1 })).rejects.toBeInstanceOf(JdAnalysisEstimateChangedError);
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.userId, userId));
    expect(job).toBeUndefined();
  });

  it("insufficient balance places no hold", async () => {
    const { userId, jdId } = await setup(0);
    const est = await estimateJdAnalysis(db, { userId, jdId });
    if (est.cached) throw new Error("unexpected cache");
    await expect(startJdAnalysis(db, { userId, jdId, confirmedCredits: est.estimate.credits })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("another user can't estimate, start or read someone else's JD", async () => {
    const { jdId } = await setup();
    const other = await setup();
    await expect(estimateJdAnalysis(db, { userId: other.userId, jdId })).rejects.toThrow();
    await expect(startJdAnalysis(db, { userId: other.userId, jdId, confirmedCredits: 9999 })).rejects.toThrow();
    await expect(getJdAnalysisStatus(db, { userId: other.userId, jdId })).rejects.toThrow();
  });
});
