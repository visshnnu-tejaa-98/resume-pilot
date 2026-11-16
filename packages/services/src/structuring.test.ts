import { randomUUID } from "node:crypto";
import {
  createDatabase,
  creditLedger,
  resumes,
  resumeVersions,
  users,
  type Database,
} from "@resume-pilot/database";
import {
  fromStructuredOutput,
  resumeSchema,
  unreviewedLowConfidence,
} from "@resume-pilot/validators/resume";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getOriginalVersion,
  processStructuring,
  resumeContentHash,
  STRUCTURING_FAILED_MESSAGE,
  STRUCTURING_TEMPORARY_MESSAGE,
  type StructuringDeps,
} from "./structuring";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

const RAW_TEXT = `Priya Raman
priya@example.com
Senior Software Engineer, Flipkart  Jan 2021 - Present
Cut checkout p95 latency by 38%
B.Tech, NIT Trichy, 2017`;

const RESUME = fromStructuredOutput({
  personalInfo: { firstName: "Priya", lastName: "Raman", email: "priya@example.com" },
  workExperience: [
    {
      company: "Flipkart",
      designation: "Senior Software Engineer",
      startDate: { value: "2021-01", raw: "Jan 2021" },
      endDate: { value: null, raw: "Present" },
      isCurrent: true,
      bullets: [{ text: "Cut checkout p95 latency by 38%", kind: "achievement" }],
    },
  ],
  education: [
    { institution: "NIT Trichy", degree: "B.Tech", endDate: { value: "2017", raw: "2017" } },
  ],
});

const ok = (): StructuringDeps => ({
  structure: vi.fn(async () => ({
    resume: RESUME,
    model: "gpt-test",
    promptVersion: "extract-v1",
    usage: { inputTokens: 900, outputTokens: 600, cachedInputTokens: 0 },
  })),
  isFinalAttempt: false,
});

describe.skipIf(!connectionString)("processStructuring (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function processedResume(
    extractionMeta: unknown = { pages: [{ method: "text_layer", chars: 100 }] },
  ) {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `structure-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    const [r] = await db
      .insert(resumes)
      .values({
        userId,
        fileKey: "k",
        fileName: "cv.pdf",
        fileFormat: "pdf",
        fileHash: randomUUID(),
        status: "processed",
        rawText: RAW_TEXT,
        extractionMeta,
      })
      .returning();
    return { userId, resumeId: r!.id };
  }
  const row = async (id: string) => (await db.select().from(resumes).where(eq(resumes.id, id)))[0]!;
  const versions = (id: string) =>
    db.select().from(resumeVersions).where(eq(resumeVersions.resumeId, id));

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  });

  it("saves a valid original version and marks the resume ready, recording model usage", async () => {
    const { userId, resumeId } = await processedResume();

    const outcome = await processStructuring(db, resumeId, ok());

    expect(outcome.status).toBe("ready");
    const [v] = await versions(resumeId);
    expect(v).toMatchObject({
      kind: "original",
      parentVersionId: null,
      contentHash: resumeContentHash(RESUME),
    });
    expect(resumeSchema.safeParse(v!.content).success).toBe(true);
    expect(await row(resumeId)).toMatchObject({
      status: "ready",
      extractionError: null,
      extractionMeta: {
        pages: [{ method: "text_layer" }],
        structuring: { model: "gpt-test", usage: { inputTokens: 900, outputTokens: 600 } },
      },
    });
    expect(await getOriginalVersion(db, { userId, resumeId })).toMatchObject({ versionId: v!.id });
  });

  it("done-when: invalid output is never saved — the job fails cleanly with no version", async () => {
    const { resumeId } = await processedResume();
    const bad = {
      ...ok(),
      structure: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("invalid"), { retryable: true })),
    };

    // Not the last attempt: reset to processed and throw so the queue retries.
    await expect(processStructuring(db, resumeId, bad)).rejects.toThrow("invalid");
    expect((await row(resumeId)).status).toBe("processed");
    expect(await versions(resumeId)).toHaveLength(0);

    // Last attempt: failed with a message, still nothing saved.
    expect(await processStructuring(db, resumeId, { ...bad, isFinalAttempt: true })).toEqual({
      status: "failed",
      message: STRUCTURING_FAILED_MESSAGE,
    });
    expect(await row(resumeId)).toMatchObject({
      status: "failed",
      extractionError: STRUCTURING_FAILED_MESSAGE,
    });
    expect(await versions(resumeId)).toHaveLength(0);
  });

  it("a fault on our side (no key, OpenAI down) shows a 'retry later' message, not 'upload a cleaner copy'", async () => {
    const { resumeId } = await processedResume();
    const noKey = {
      ...ok(),
      structure: vi.fn().mockRejectedValue(
        Object.assign(new Error("OPENAI_API_KEY is not set"), {
          kind: "config_error",
          retryable: false,
        }),
      ),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await processStructuring(db, resumeId, noKey)).toEqual({
      status: "failed",
      message: STRUCTURING_TEMPORARY_MESSAGE,
    });
    expect(noKey.structure).toHaveBeenCalledTimes(1);
  });

  it("a non-retryable error (refusal, bad request) fails immediately", async () => {
    const { resumeId } = await processedResume();
    const refused = {
      ...ok(),
      structure: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("refused"), { retryable: false })),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await processStructuring(db, resumeId, refused)).status).toBe("failed");
    expect(await versions(resumeId)).toHaveLength(0);
  });

  it("refuses to save a structure function's output that isn't schema 2.0", async () => {
    const { resumeId } = await processedResume();
    const corrupt = {
      ...ok(),
      isFinalAttempt: true,
      structure: vi.fn(async () => ({
        resume: { ...RESUME, workExperience: [{ ...RESUME.workExperience[0]!, id: "not an id" }] },
        model: "m",
        promptVersion: "p",
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      })),
    };
    expect((await processStructuring(db, resumeId, corrupt as StructuringDeps)).status).toBe(
      "failed",
    );
    expect(await versions(resumeId)).toHaveLength(0);
  });

  it("done-when: fields from low-confidence OCR lines are flagged, traceable to the line", async () => {
    const { resumeId } = await processedResume({
      pages: [
        {
          method: "ocr",
          chars: 100,
          ocrConfidence: 71,
          lowConfidenceLines: [
            {
              page: 1,
              text: "Senior Software Engineer, Flipkart  Jan 2021 - Present",
              confidence: 48,
            },
          ],
        },
      ],
    });

    const outcome = await processStructuring(db, resumeId, ok());

    expect(outcome).toMatchObject({ status: "ready" });
    const [v] = await versions(resumeId);
    const meta = v!.extractionMeta as Record<
      string,
      { confidence: string; source?: { ocrConfidence?: number; line?: string } }
    >;
    const jobId = RESUME.workExperience[0]!.id;
    expect(meta[`workExperience[id=${jobId}].company`]).toMatchObject({
      confidence: "low",
      source: {
        kind: "ocr_line",
        page: 1,
        ocrConfidence: 48,
        line: "Senior Software Engineer, Flipkart  Jan 2021 - Present",
      },
    });
    expect(unreviewedLowConfidence(meta as never)).toContain(`workExperience[id=${jobId}].company`);
    // A field from a clean line isn't flagged.
    expect(meta["education[id=ed_1].institution"]).toBeUndefined();
  });

  it("two concurrent attempts save exactly one original", async () => {
    const { resumeId } = await processedResume();
    const results = await Promise.allSettled([
      processStructuring(db, resumeId, ok()),
      processStructuring(db, resumeId, ok()),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await versions(resumeId)).toHaveLength(1);
    expect((await row(resumeId)).status).toBe("ready");
  });

  it("skips resumes that are already ready or have no text yet", async () => {
    const { resumeId } = await processedResume();
    await processStructuring(db, resumeId, ok());
    const again = ok();
    expect(await processStructuring(db, resumeId, again)).toMatchObject({ status: "skipped" });
    expect(again.structure).not.toHaveBeenCalled();

    const { resumeId: noText } = await processedResume();
    await db.update(resumes).set({ rawText: null }).where(eq(resumes.id, noText));
    expect(await processStructuring(db, noText, ok())).toMatchObject({
      status: "skipped",
      reason: "no raw text yet",
    });
  });

  it("is free: no ledger entries for the user", async () => {
    const { userId, resumeId } = await processedResume();
    await processStructuring(db, resumeId, ok());
    expect(
      await db.select().from(creditLedger).where(eq(creditLedger.userId, userId)),
    ).toHaveLength(0);
  });

  it("getOriginalVersion only returns the owner's resume", async () => {
    const { resumeId } = await processedResume();
    await processStructuring(db, resumeId, ok());
    const { userId: other } = await processedResume();
    expect(await getOriginalVersion(db, { userId: other, resumeId })).toBeNull();
  });
});
