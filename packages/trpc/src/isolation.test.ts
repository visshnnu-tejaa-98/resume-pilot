import { createHash, randomUUID } from "node:crypto";
import { aiJobs, createDatabase, resumeFiles, resumes, resumeVersions, users, type Database } from "@resume-pilot/database";
import { createUserFromClerkWebhook, grantCredits } from "@resume-pilot/services";
import { resumeSchema } from "@resume-pilot/validators/resume";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@resume-pilot/queue", async (orig) => ({
  ...(await orig<typeof import("@resume-pilot/queue")>()),
  getExtractionQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getAiQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getPdfQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getTransactionalEmailQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
}));
vi.mock("@resume-pilot/storage", async (orig) => {
  const real = await orig<typeof import("@resume-pilot/storage")>();
  const storage = real.createImageKitStorage({ privateKey: "test", urlEndpoint: "https://ik.example" }, {
    files: { upload: vi.fn(), delete: vi.fn() },
    helper: { buildSrc: (o: { src: string }) => `https://ik.example${o.src}?ik-s=sig` },
  } as never);
  return { ...real, getStorage: () => storage };
});

import { createContext } from "./context";
import { appRouter } from "./router";

/**
 * Acceptance 16.2.14: user A's resumes, files, versions, JDs, jobs,
 * reports and wallet are invisible and untouchable for user B — every read
 * and every mutation that takes an id, with A's real ids.
 */

const connectionString = process.env.DATABASE_URL;
const JD = `Frontend Engineer at Acme. ${"We build React and TypeScript dashboards for enterprise customers. ".repeat(5)}`;

describe.skipIf(!connectionString)("cross-tenant isolation (real DB)", () => {
  let db: Database;
  const clerkA = `clerk_${randomUUID()}`;
  const clerkB = `clerk_${randomUUID()}`;
  const created: string[] = [];
  const a = { resumeId: "", versionId: "", jdId: "", aiJobId: "" };
  const B = () => appRouter.createCaller(createContext({ db, userId: clerkB }));
  const A = () => appRouter.createCaller(createContext({ db, userId: clerkA }));

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    const ua = await createUserFromClerkWebhook(db, { clerkUserId: clerkA, email: `a-${randomUUID()}@example.com` });
    const ub = await createUserFromClerkWebhook(db, { clerkUserId: clerkB, email: `b-${randomUUID()}@example.com` });
    created.push(ua.userId, ub.userId);
    await grantCredits(db, { userId: ua.userId, type: "coupon_credit", credits: 5000, sourceType: "admin_adjustment", sourceId: randomUUID(), note: "isolation test" });

    const key = `/users/${ua.userId}/uploads/${randomUUID()}.pdf`;
    const [r] = await db.insert(resumes).values({ userId: ua.userId, fileKey: key, fileName: "a.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    a.resumeId = r!.id;
    await db.insert(resumeFiles).values({ resumeId: a.resumeId, pageIndex: 0, storageKey: key, storageFileId: "f1", mimeType: "application/pdf", sizeBytes: 10 });
    const content = resumeSchema.parse({ schemaVersion: "2.0", personalInfo: { firstName: "Alice", lastName: "A", headline: "", email: "alice@example.com", phone: "", location: "", links: [] }, summary: { text: "Alice's private summary." } });
    const [v] = await db.insert(resumeVersions).values({ resumeId: a.resumeId, kind: "original", content, contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex") }).returning();
    a.versionId = v!.id;
    a.jdId = (await A().jds.create({ text: JD, jobTitle: "Frontend Engineer" })).id;
    const [j] = await db.insert(aiJobs).values({ userId: ua.userId, type: "generation", creditsEstimated: 100, pricingConfigVersion: 1, idempotencyKey: `iso-${randomUUID()}` }).returning();
    a.aiJobId = j!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, created));
    await db.$client.end();
  });

  const denied = async (p: Promise<unknown>) => {
    const code = await p.then(
      () => "OK",
      (e: { code?: string }) => e.code ?? "THREW",
    );
    expect(["NOT_FOUND", "FORBIDDEN"]).toContain(code);
  };

  it("A can see their own data (the fixture is real)", async () => {
    expect((await A().resumes.list()).map((r) => r.id)).toContain(a.resumeId);
    expect((await A().jds.get({ jdId: a.jdId })).id).toBe(a.jdId);
  });

  it("lists: B sees none of A's resumes, versions, JDs, or wallet entries", async () => {
    const b = B();
    expect(JSON.stringify(await b.resumes.list())).not.toContain(a.resumeId);
    expect(JSON.stringify(await b.versions.list())).not.toContain(a.versionId);
    expect(JSON.stringify(await b.versions.deleted())).not.toContain(a.versionId);
    expect(JSON.stringify(await b.jds.list())).not.toContain(a.jdId);
    expect(JSON.stringify(await b.walletHistory({}))).not.toMatch(/isolation test/);
    expect((await b.wallet()).balance).toBe(0);
  });

  it("resumes and files: every read and action with A's resume id is denied", async () => {
    const b = B();
    await denied(b.resumes.fileUrls({ resumeId: a.resumeId }));
    await denied(b.resumes.original({ resumeId: a.resumeId }));
    await denied(b.resumes.readiness({ resumeId: a.resumeId }));
    // Retry answers someone else's resume exactly like a non-existent one, so it can't be used to probe ids.
    const foreign = await b.resumes.retryExtraction({ resumeId: a.resumeId }).catch((e: { code: string; message: string }) => [e.code, e.message]);
    const missing = await b.resumes.retryExtraction({ resumeId: randomUUID() }).catch((e: { code: string; message: string }) => [e.code, e.message]);
    expect(foreign).toEqual(missing);
    const [row] = await db.select().from(resumes).where(eq(resumes.id, a.resumeId));
    expect(row!.status).toBe("ready");
  });

  it("versions: get, save, template, duplicate, delete, restore, PDF — all denied, A's data unchanged", async () => {
    const b = B();
    const id = { versionId: a.versionId };
    await denied(b.versions.get(id));
    await denied(b.versions.save({ ...id, content: { hacked: true } }));
    await denied(b.versions.setTemplate({ ...id, template: "modern" }));
    await denied(b.versions.duplicate(id));
    await denied(b.versions.delete(id));
    await denied(b.versions.restore(id));
    await denied(b.versions.exportPdf(id));
    await denied(b.versions.pdfStatus(id));
    const [row] = await db.select().from(resumeVersions).where(eq(resumeVersions.id, a.versionId));
    expect((row!.content as { summary: { text: string } }).summary.text).toBe("Alice's private summary.");
    expect(row!.deletedAt ?? null).toBeNull();
  });

  it("JDs: get, analysis, revise, estimate, analyze — all denied", async () => {
    const b = B();
    await denied(b.jds.get({ jdId: a.jdId }));
    await denied(b.jds.analysis({ jdId: a.jdId }));
    await denied(b.jds.revise({ jdId: a.jdId, text: JD }));
    await denied(b.jds.estimateAnalysis({ jdId: a.jdId }));
    await denied(b.jds.analyze({ jdId: a.jdId, confirmedCredits: 100 }));
  });

  it("AI work on A's version/JD: estimates, starts and job status are denied, and B is never charged", async () => {
    const b = B();
    await denied(b.generation.estimate({ sourceVersionId: a.versionId, jdId: a.jdId }));
    await denied(b.generation.start({ sourceVersionId: a.versionId, jdId: a.jdId, confirmedCredits: 100, requestId: randomUUID() }));
    await denied(b.generation.status({ aiJobId: a.aiJobId }));
    await denied(b.scoring.estimate({ versionId: a.versionId, jdId: a.jdId }));
    await denied(b.scoring.start({ versionId: a.versionId, jdId: a.jdId, confirmedCredits: 100, requestId: randomUUID() }));
    await denied(b.scoring.status({ aiJobId: a.aiJobId }));
    await denied(b.compare.estimate({ aVersionId: a.versionId, bVersionId: a.versionId, jdId: a.jdId }));
    expect((await b.wallet()).balance).toBe(0);
  });

  it("reports: history/current for A's version and an unknown report id are denied", async () => {
    const b = B();
    expect(await b.reports.history({ versionId: a.versionId })).toEqual([]); // filtered by owner: nothing to see
    await denied(b.reports.current({ versionId: a.versionId, jdId: a.jdId }));
    await denied(b.reports.get({ reportId: randomUUID() }));
  });
});
