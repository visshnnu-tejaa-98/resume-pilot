import { randomUUID } from "node:crypto";
import { RESUMES } from "@resume-pilot/ai/fixtures";
import { aiJobs, auditLogs, createDatabase, emailEvents, payments, resumes, resumeVersions, users, type Database } from "@resume-pilot/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminInsights, adminUserExtras, adminViewResumeContent, typicalCreditsPerAction } from "./admin-insights";
import { setEmailPreferences } from "./email-prefs";
import { getWalletPage, grantCredits } from "./ledger";
import { resumeContentHash } from "./structuring";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;
const SOURCE = RESUMES.frontend!;

describe.skipIf(!connectionString)("admin insights + logged content access (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const newUser = async () => {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `adm-${randomUUID()}@example.com` });
    userIds.push(userId);
    return userId;
  };
  const job = (userId: string, v: Partial<typeof aiJobs.$inferInsert>) =>
    db
      .insert(aiJobs)
      .values({ userId, type: "generation", status: "succeeded", creditsEstimated: 100, idempotencyKey: randomUUID(), pricingConfigVersion: sql`(select max(version) from pricing_config)` as never, ...v })
      .returning()
      .then((r) => r[0]!);

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    await db.delete(auditLogs).where(inArray(auditLogs.adminUserId, userIds));
    if (userIds.length) await db.delete(emailEvents).where(inArray(sql`${emailEvents.payload} ->> 'userId'`, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it("viewing resume content needs a reason and writes the audit row (16.2.15, §12.2)", async () => {
    const admin = await newUser();
    const owner = await newUser();
    const other = await newUser();
    const [r] = await db.insert(resumes).values({ userId: owner, fileKey: `k/${randomUUID()}`, fileName: "asha.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    const [v] = await db.insert(resumeVersions).values({ resumeId: r!.id, kind: "original", content: SOURCE, contentHash: resumeContentHash(SOURCE) }).returning();

    await expect(adminViewResumeContent(db, { adminUserId: admin, userId: owner, versionId: v!.id, reason: " " })).rejects.toThrow(/reason/);
    await expect(adminViewResumeContent(db, { adminUserId: admin, userId: other, versionId: v!.id, reason: "support ticket" })).rejects.toThrow(/not found/);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.targetId, v!.id))).toHaveLength(0);

    const got = await adminViewResumeContent(db, { adminUserId: admin, userId: owner, versionId: v!.id, reason: "support ticket #42" });
    expect(got.content.personalInfo.lastName).toBe(SOURCE.personalInfo.lastName);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.targetId, v!.id), eq(auditLogs.action, "resume.view_content")));
    expect(logs).toEqual([expect.objectContaining({ adminUserId: admin, reason: "support ticket #42", metadata: { userId: owner } })]);
  });

  it("counts grounding violations per 100 generations, including blocked ones", async () => {
    const u = await newUser();
    const before = (await adminInsights(db, 1)).grounding;
    const [r] = await db.insert(resumes).values({ userId: u, fileKey: `k/${randomUUID()}`, fileName: "a.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    const ok = await job(u, {});
    await db.insert(resumeVersions).values({ resumeId: r!.id, kind: "generated", content: SOURCE, contentHash: "h", generationMeta: { aiJobId: ok.id, firstAttemptViolations: { unknown_skill: 2, number_mismatch: 1 } } });
    await job(u, { status: "failed", error: "Grounding check failed after retry (4 violations: unknown_company×4)" });

    const after = (await adminInsights(db, 1)).grounding;
    expect(after.generations - before.generations).toBe(2);
    expect(after.violations - before.violations).toBe(7);
    expect(after.fixedByRetry - before.fixedByRetry).toBe(1);
    expect(after.blocked - before.blocked).toBe(1);
  });

  it("publishes typical credits only once an action has enough runs", async () => {
    const u = await newUser();
    for (let i = 0; i < 3; i++) await job(u, { type: "jd_analysis", creditsCharged: 40 + i });
    expect((await typicalCreditsPerAction(db, 1_000_000)).jd_analysis).toBeUndefined();
    expect((await typicalCreditsPerAction(db, 1)).jd_analysis).toBeTypeOf("number");
  });

  it("counts opt-outs as unsubscribes, and lists the user's payments", async () => {
    const u = await newUser();
    const before = (await adminInsights(db, 1)).email.unsubscribed;
    await setEmailPreferences(db, { userId: u, source: "settings", reminders: true, productUpdates: true });
    await setEmailPreferences(db, { userId: u, source: "unsubscribe_page", reminders: false, productUpdates: false });
    expect((await adminInsights(db, 1)).email.unsubscribed - before).toBe(2);

    await db.insert(payments).values({ userId: u, orderId: `order_${randomUUID().slice(0, 12)}`, amountPaise: 50_000, credits: 10_000 });
    const x = await adminUserExtras(db, u);
    expect(x.payments).toHaveLength(1);
    expect(x.prefs).toMatchObject({ reminders: false, productUpdates: false });
  });

  it("wallet history links a purchase to its order", async () => {
    const u = await newUser();
    const [p] = await db.insert(payments).values({ userId: u, orderId: `order_${randomUUID().slice(0, 12)}`, amountPaise: 50_000, credits: 10_000, status: "captured" }).returning();
    await grantCredits(db, { userId: u, type: "purchase", credits: 10_000, sourceType: "payment", sourceId: p!.id });
    const page = await getWalletPage(db, u, { limit: 5 });
    expect(page.history[0]).toMatchObject({ type: "purchase", orderId: p!.orderId, versionId: null });
  });
});
