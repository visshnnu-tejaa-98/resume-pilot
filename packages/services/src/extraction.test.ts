import { randomUUID } from "node:crypto";
import {
  aiJobs,
  createDatabase,
  creditAccounts,
  creditHolds,
  creditLedger,
  resumeFiles,
  resumes,
  users,
  type Database,
} from "@resume-pilot/database";
import { ExtractionError } from "@resume-pilot/file-processing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  markExtractionForRetry,
  processExtraction,
  RetryExtractionError,
  TEMPORARY_FAILURE_MESSAGE,
  type ExtractionDeps,
} from "./extraction";
import { grantCredits } from "./ledger";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("processExtraction (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function newUser() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `extract-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return userId;
  }

  async function uploadedResume(userId: string, pages = 1, format: "pdf" | "png" = "pdf") {
    const [resume] = await db
      .insert(resumes)
      .values({
        userId,
        fileKey: "k0",
        fileName: `cv.${format}`,
        fileFormat: format,
        fileHash: randomUUID(),
      })
      .returning();
    await db.insert(resumeFiles).values(
      Array.from({ length: pages }, (_, i) => ({
        resumeId: resume!.id,
        pageIndex: i,
        storageKey: `k${i}`,
        storageFileId: `f${i}`,
        mimeType: "application/pdf",
        sizeBytes: 10,
      })),
    );
    return resume!.id;
  }

  const row = async (id: string) => (await db.select().from(resumes).where(eq(resumes.id, id)))[0]!;

  function deps(over: Partial<ExtractionDeps> = {}): ExtractionDeps {
    return {
      readFile: vi.fn(async ({ storageKey }) => Buffer.from(storageKey)),
      extract: vi.fn(async (_format, files) => ({
        text: `Priya Raman resume text from ${files.length} file(s)`,
        pages: files.map(() => ({ method: "text_layer" as const, chars: 30 })),
      })),
      isFinalAttempt: false,
      ...over,
    };
  }

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  });

  it("reads every page in order, stores the raw text, and marks the resume processed", async () => {
    const userId = await newUser();
    const resumeId = await uploadedResume(userId, 3, "png");
    const d = deps();

    const outcome = await processExtraction(db, resumeId, d);

    expect(outcome.status).toBe("processed");
    expect((d.readFile as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      { userId, storageKey: "k0" },
      { userId, storageKey: "k1" },
      { userId, storageKey: "k2" },
    ]);
    expect(await row(resumeId)).toMatchObject({
      status: "processed",
      rawText: "Priya Raman resume text from 3 file(s)",
      extractionError: null,
      extractionMeta: {
        pages: [{ method: "text_layer" }, { method: "text_layer" }, { method: "text_layer" }],
      },
    });
  });

  it("a bad file fails with the user-facing reason and isn't retried", async () => {
    const resumeId = await uploadedResume(await newUser());
    const outcome = await processExtraction(
      db,
      resumeId,
      deps({ extract: vi.fn().mockRejectedValue(new ExtractionError("low_quality_image")) }),
    );
    expect(outcome).toMatchObject({ status: "failed", reason: "low_quality_image" });
    expect(await row(resumeId)).toMatchObject({
      status: "failed",
      extractionError: expect.stringMatching(/clearer/),
    });
  });

  it("a transient error throws for retry and resets to uploaded; the final attempt fails it", async () => {
    const resumeId = await uploadedResume(await newUser());
    const flaky = deps({ readFile: vi.fn().mockRejectedValue(new Error("ImageKit 503")) });

    await expect(processExtraction(db, resumeId, flaky)).rejects.toThrow("503");
    expect((await row(resumeId)).status).toBe("uploaded");

    const outcome = await processExtraction(db, resumeId, { ...flaky, isFinalAttempt: true });
    expect(outcome).toMatchObject({ status: "failed", reason: "temporary" });
    expect((await row(resumeId)).extractionError).toBe(TEMPORARY_FAILURE_MESSAGE);
  });

  it("done-when: extraction, success or failure, never touches the wallet", async () => {
    const userId = await newUser();
    await grantCredits(db, {
      userId,
      type: "purchase",
      credits: 1000,
      sourceType: "payment",
      sourceId: randomUUID(),
    });
    const snapshot = async () => ({
      balance: (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)))[0]!
        .balance,
      ledger: (await db.select().from(creditLedger).where(eq(creditLedger.userId, userId))).length,
      holds: (await db.select().from(creditHolds).where(eq(creditHolds.userId, userId))).length,
      jobs: (await db.select().from(aiJobs).where(eq(aiJobs.userId, userId))).length,
    });
    const before = await snapshot();

    await processExtraction(db, await uploadedResume(userId), deps());
    await processExtraction(
      db,
      await uploadedResume(userId),
      deps({ extract: vi.fn().mockRejectedValue(new ExtractionError("no_text")) }),
    );
    await processExtraction(
      db,
      await uploadedResume(userId),
      deps({ readFile: vi.fn().mockRejectedValue(new Error("boom")), isFinalAttempt: true }),
    );

    expect(await snapshot()).toEqual(before);
    expect(before).toEqual({ balance: 1000, ledger: 1, holds: 0, jobs: 0 });
  });

  it("files deleted by the 30-day cleanup fail with an 'upload again' message", async () => {
    const resumeId = await uploadedResume(await newUser());
    await db
      .update(resumeFiles)
      .set({ storageFileId: null })
      .where(eq(resumeFiles.resumeId, resumeId));
    const outcome = await processExtraction(db, resumeId, deps());
    expect(outcome).toMatchObject({ status: "failed", reason: "files_gone" });
  });

  it("skips missing and already-processed resumes", async () => {
    expect(await processExtraction(db, randomUUID(), deps())).toMatchObject({ status: "skipped" });
    const resumeId = await uploadedResume(await newUser());
    await processExtraction(db, resumeId, deps());
    const d = deps();
    expect(await processExtraction(db, resumeId, d)).toMatchObject({ status: "skipped" });
    expect(d.readFile).not.toHaveBeenCalled();
  });

  it("retry: only the owner, only from failed", async () => {
    const owner = await newUser();
    const resumeId = await uploadedResume(owner);
    await processExtraction(
      db,
      resumeId,
      deps({ extract: vi.fn().mockRejectedValue(new ExtractionError("no_text")) }),
    );

    await expect(
      markExtractionForRetry(db, { userId: await newUser(), resumeId }),
    ).rejects.toBeInstanceOf(RetryExtractionError);
    await markExtractionForRetry(db, { userId: owner, resumeId });
    expect(await row(resumeId)).toMatchObject({ status: "uploaded", extractionError: null });
    // Not failed any more, so a second retry is refused.
    await expect(markExtractionForRetry(db, { userId: owner, resumeId })).rejects.toBeInstanceOf(
      RetryExtractionError,
    );
  });
});
