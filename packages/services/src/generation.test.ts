import { randomUUID } from "node:crypto";
import { generateTailoredResume, type ResponsesClient } from "@resume-pilot/ai";
import { JD_ANALYSES, RESUMES } from "@resume-pilot/ai/fixtures";
import { aiJobs, createDatabase, creditAccounts, creditLedger, jdAnalyses, resumes, resumeVersions, users, type Database } from "@resume-pilot/database";
import type { Resume } from "@resume-pilot/validators/resume";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWalletBalance } from "./credits";
import { estimateGeneration, GenerationError, getGenerationStatus, processGeneration, startGeneration, type GenerateFn } from "./generation";
import { createJobDescription } from "./jd";
import type { JdAnalyzeFn } from "./jd-analysis";
import { saveOriginalReview } from "./review";
import { resumeContentHash } from "./structuring";
import { createUserFromClerkWebhook } from "./user";
import { deleteVersion, duplicateVersion, getVersion, listVersions, purgeDeletedVersions, restoreVersion, saveVersionContent, VersionError } from "./versions";

const connectionString = process.env.DATABASE_URL;
const SOURCE = RESUMES.frontend!;
const ANALYSIS = JD_ANALYSES.fe!;
const JD_TEXT = "We are hiring a Frontend Engineer with 4+ years of React and TypeScript to build our design system. ".repeat(4);

/** A model that returns these plans in order (real assemble + grounding run on them). */
function model(...plans: object[]): ResponsesClient {
  return {
    responses: {
      create: async () =>
        ({ status: "completed", output: [], output_text: JSON.stringify(plans.shift()), usage: { input_tokens: 3000, output_tokens: 800, input_tokens_details: { cached_tokens: 0 } } }) as never,
    },
  };
}
const goodPlan = () => ({
  summary: "Frontend engineer with 5 years of experience building React and TypeScript design systems.",
  sectionOrder: ["summary", "workExperience", "skills"],
  workExperience: [{ id: "we_1", bullets: [{ text: "Built a React and TypeScript design system adopted by 4 product teams.", sourceBulletIds: ["b_1"], changeType: "rewritten" }] }],
  projects: [{ id: "pr_1", bullets: [{ text: "Accessible React date picker with keyboard support.", sourceBulletIds: ["b_6"], changeType: "unchanged" }] }],
  skills: [{ category: "Frontend", items: ["React", "TypeScript", "JavaScript"] }],
  gaps: [{ requirementId: "r3", keyword: "GraphQL", note: "Not found in your resume" }],
});
const kubernetesPlan = () => ({ ...goodPlan(), skills: [{ category: "Skills", items: ["React", "Kubernetes"] }] });

const generateWith =
  (client: ResponsesClient): GenerateFn =>
  async (input) => {
    const r = await generateTailoredResume(client, input);
    return { ...r, usage: r.usage };
  };
const analyze: JdAnalyzeFn = async () => ({ analysis: ANALYSIS, usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 } });

describe.skipIf(!connectionString)("generation + versioning (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function setup(opts: { balance?: number; analysed?: boolean; flagged?: boolean } = {}) {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `gen-${randomUUID()}@example.com` });
    userIds.push(userId);
    await db.update(creditAccounts).set({ balance: opts.balance ?? 100_000 }).where(eq(creditAccounts.userId, userId));
    const [resume] = await db.insert(resumes).values({ userId, fileKey: `k/${randomUUID()}`, fileName: "asha.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    const [original] = await db
      .insert(resumeVersions)
      .values({
        resumeId: resume!.id,
        kind: "original",
        content: SOURCE,
        contentHash: resumeContentHash(SOURCE),
        extractionMeta: opts.flagged ? { "summary.text": { confidence: "low", reason: "unclear", reviewed: false } } : {},
      })
      .returning();
    const jd = await createJobDescription(db, userId, { text: JD_TEXT, companyName: "Acme", jobTitle: "Frontend Engineer" });
    if (opts.analysed !== false) {
      await db.insert(jdAnalyses).values({ jdId: jd.id, jobTitle: ANALYSIS.jobTitle, seniority: ANALYSIS.seniority, minYearsExperience: ANALYSIS.minYearsExperience, requirements: ANALYSIS.requirements, educationRequirements: [], domainTerms: [] });
    }
    return { userId, resumeId: resume!.id, originalId: original!.id, jdId: jd.id };
  }

  async function run(s: Awaited<ReturnType<typeof setup>>, client = model(goodPlan()), sourceVersionId = s.originalId) {
    const est = await estimateGeneration(db, { userId: s.userId, sourceVersionId, jdId: s.jdId });
    const start = await startGeneration(db, { userId: s.userId, sourceVersionId, jdId: s.jdId, confirmedCredits: est.total, requestId: randomUUID() });
    const result = await processGeneration(db, { aiJobId: start.aiJobId }, { generate: generateWith(client), analyze, isFinalAttempt: true });
    return { est, start, result };
  }
  const captures = (userId: string) => db.select().from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "capture")));

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it("estimate places no hold and creates nothing (Cancel charges nothing, 16.2.3)", async () => {
    const s = await setup();
    const est = await estimateGeneration(db, { userId: s.userId, sourceVersionId: s.originalId, jdId: s.jdId });
    expect(est.lines.map((l) => l.action)).toEqual(["generation"]);
    expect(await db.select().from(aiJobs).where(eq(aiJobs.userId, s.userId))).toHaveLength(0);
    expect((await getWalletBalance(db, s.userId)).held).toBe(0);
  });

  it("generates a new independent version, captures ≤ estimate, records gaps and provenance", async () => {
    const s = await setup();
    const { est, result } = await run(s);
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") return;
    const v = await getVersion(db, { userId: s.userId, versionId: result.versionId });
    expect(v.kind).toBe("generated");
    expect(v.parentVersionId).toBe(s.originalId);
    expect(v.jdId).toBe(s.jdId);
    expect(v.content.workExperience.map((w) => w.company)).toEqual(SOURCE.workExperience.map((w) => w.company));
    expect((v.generationMeta as { gaps: { keyword: string }[] }).gaps[0]!.keyword).toBe("GraphQL");
    const [c] = await captures(s.userId);
    expect(-c!.credits).toBeLessThanOrEqual(est.total);
    expect((await getWalletBalance(db, s.userId)).held).toBe(0);
  });

  it("every generation is a new row; the original is never touched", async () => {
    const s = await setup();
    const a = await run(s);
    const b = await run(s);
    expect(a.result.status === "succeeded" && b.result.status === "succeeded" && a.result.versionId !== b.result.versionId).toBe(true);
    const [orig] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, s.originalId));
    expect(orig!.content).toEqual(SOURCE);
  });

  it("16.2.9: editing the original after generating leaves the generated version unchanged", async () => {
    const s = await setup();
    const { result } = await run(s);
    if (result.status !== "succeeded") throw new Error("expected success");
    const before = (await getVersion(db, { userId: s.userId, versionId: result.versionId })).content;
    const edited: Resume = structuredClone(SOURCE);
    edited.workExperience[0]!.company = "Northwind Labs";
    edited.summary.text = "Changed summary";
    await saveOriginalReview(db, { userId: s.userId, resumeId: s.resumeId, content: edited, reviewedPaths: [] });
    const after = (await getVersion(db, { userId: s.userId, versionId: result.versionId })).content;
    expect(after).toEqual(before);
    expect(after.workExperience[0]!.company).toBe("Northwind");
  });

  it("an un-analysed JD: analysis + generation holds, analysis runs first, two captures", async () => {
    const s = await setup({ analysed: false });
    const { est, start, result } = await run(s);
    expect(est.lines.map((l) => l.action)).toEqual(["jd_analysis", "generation"]);
    expect(start.analysisAiJobId).not.toBeNull();
    expect(result.status).toBe("succeeded");
    expect(await captures(s.userId)).toHaveLength(2);
    const status = await getGenerationStatus(db, { userId: s.userId, aiJobId: start.aiJobId });
    expect(status).toMatchObject({ status: "succeeded", analysis: "succeeded" });
  });

  it("grounding fails twice ('add Kubernetes'): no version saved, hold released, violations logged", async () => {
    const s = await setup();
    const { start, result } = await run(s, model(kubernetesPlan(), kubernetesPlan()));
    expect(result.status).toBe("failed");
    expect(await captures(s.userId)).toHaveLength(0);
    expect((await getWalletBalance(db, s.userId)).held).toBe(0);
    expect((await listVersions(db, s.userId)).filter((v) => v.kind === "generated")).toHaveLength(0);
    const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, start.aiJobId));
    expect(job!.error).toMatch(/skill_not_in_source/);
  });

  it("one bad attempt then a clean retry: saved, retry stats recorded", async () => {
    const s = await setup();
    const { result } = await run(s, model(kubernetesPlan(), goodPlan()));
    if (result.status !== "succeeded") throw new Error("expected success");
    const v = await getVersion(db, { userId: s.userId, versionId: result.versionId });
    expect(v.generationMeta).toMatchObject({ attempts: 2, firstAttemptViolations: { skill_not_in_source: 1 } });
    expect(JSON.stringify(v.content)).not.toContain("Kubernetes");
  });

  it("same requestId twice = one job, one hold", async () => {
    const s = await setup();
    const est = await estimateGeneration(db, { userId: s.userId, sourceVersionId: s.originalId, jdId: s.jdId });
    const requestId = randomUUID();
    const args = { userId: s.userId, sourceVersionId: s.originalId, jdId: s.jdId, confirmedCredits: est.total, requestId };
    const [a, b] = await Promise.all([startGeneration(db, args), startGeneration(db, args)]);
    expect(a.aiJobId).toBe(b.aiJobId);
    expect((await getWalletBalance(db, s.userId)).held).toBe(est.total);
  });

  it("refuses a hold above the confirmed estimate, and an unreviewed original", async () => {
    const s = await setup();
    await expect(startGeneration(db, { userId: s.userId, sourceVersionId: s.originalId, jdId: s.jdId, confirmedCredits: 1, requestId: randomUUID() })).rejects.toMatchObject({ code: "estimate_changed" });
    const flagged = await setup({ flagged: true });
    await expect(estimateGeneration(db, { userId: flagged.userId, sourceVersionId: flagged.originalId, jdId: flagged.jdId })).rejects.toBeInstanceOf(GenerationError);
  });

  it("can generate from an edited version: the edits are the new source facts", async () => {
    const s = await setup();
    const first = await run(s);
    if (first.result.status !== "succeeded") throw new Error("expected success");
    const v = await getVersion(db, { userId: s.userId, versionId: first.result.versionId });
    const edited = structuredClone(v.content);
    edited.skills[0]!.items.push({ id: "s_99", name: "GraphQL" });
    await saveVersionContent(db, { userId: s.userId, versionId: v.id, content: edited });
    const plan = { ...goodPlan(), skills: [{ category: "Frontend", items: ["React", "GraphQL"] }], gaps: [] };
    const second = await run(s, model(plan), v.id);
    expect(second.result.status).toBe("succeeded");
  });

  it("duplicate costs nothing; delete → restore within 30 days; expired restore fails; purge removes it", async () => {
    const s = await setup();
    const { result } = await run(s);
    if (result.status !== "succeeded") throw new Error("expected success");
    const before = (await getWalletBalance(db, s.userId)).balance;
    const dup = await duplicateVersion(db, { userId: s.userId, versionId: result.versionId });
    expect((await getWalletBalance(db, s.userId)).balance).toBe(before);
    expect((await getVersion(db, { userId: s.userId, versionId: dup.versionId })).content).toEqual((await getVersion(db, { userId: s.userId, versionId: result.versionId })).content);

    await deleteVersion(db, { userId: s.userId, versionId: dup.versionId });
    await expect(getVersion(db, { userId: s.userId, versionId: dup.versionId })).rejects.toBeInstanceOf(VersionError);
    expect(await restoreVersion(db, { userId: s.userId, versionId: dup.versionId })).toEqual({ restored: true });

    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    await deleteVersion(db, { userId: s.userId, versionId: dup.versionId }, longAgo);
    await expect(restoreVersion(db, { userId: s.userId, versionId: dup.versionId })).rejects.toMatchObject({ code: "restore_expired" });
    await purgeDeletedVersions(db);
    expect(await db.select().from(resumeVersions).where(eq(resumeVersions.id, dup.versionId))).toHaveLength(0);
    await expect(deleteVersion(db, { userId: s.userId, versionId: s.originalId })).rejects.toMatchObject({ code: "original" });
  });

  it("other users can't read, edit, duplicate or generate from someone else's version", async () => {
    const s = await setup();
    const other = await setup();
    await expect(getVersion(db, { userId: other.userId, versionId: s.originalId })).rejects.toBeInstanceOf(VersionError);
    await expect(duplicateVersion(db, { userId: other.userId, versionId: s.originalId })).rejects.toBeInstanceOf(VersionError);
    await expect(estimateGeneration(db, { userId: other.userId, sourceVersionId: s.originalId, jdId: other.jdId })).rejects.toBeInstanceOf(GenerationError);
  });
});
