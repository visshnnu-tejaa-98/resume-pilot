import { randomUUID } from "node:crypto";
import { createDatabase, resumes, resumeVersions, users, type Database } from "@resume-pilot/database";
import { fromStructuredOutput, type ExtractionMeta } from "@resume-pilot/validators/resume";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGenerationReadiness, reconcileFlags, ReviewError, saveOriginalReview } from "./review";
import { resumeContentHash } from "./structuring";
import { createUserFromClerkWebhook } from "./user";

const RESUME = fromStructuredOutput({
  personalInfo: { firstName: "Priya", lastName: "Raman", email: "priya@example.com" },
  workExperience: [
    {
      company: "Flipkrt",
      designation: "Engineer",
      startDate: { value: "2021", raw: "2021" },
      endDate: { value: null, raw: "Present" },
      isCurrent: true,
      bullets: [{ text: "Cut latency by 38%", kind: "achievement" }],
    },
    { company: "Globex", designation: "Intern", bullets: [] },
  ],
});
const we1 = RESUME.workExperience[0]!.id;
const we2 = RESUME.workExperience[1]!.id;

const flag = (confidence: "low" | "medium") => ({
  confidence,
  reason: "check",
  reviewed: false,
});
const META: ExtractionMeta = {
  [`workExperience[id=${we1}].company`]: flag("low"),
  [`workExperience[id=${we1}].startDate`]: flag("low"),
  [`workExperience[id=${we2}].designation`]: flag("low"),
  "personalInfo.email": flag("medium"),
};
const clone = <T>(v: T): T => structuredClone(v);

describe("reconcileFlags", () => {
  it("marks, edits and deletions each clear a flag; untouched flags stay", () => {
    const after = clone(RESUME);
    after.workExperience[0]!.company = "Flipkart"; // edited → user's own claim
    after.workExperience.splice(1, 1); // deleted → flag dropped
    const out = reconcileFlags(META, RESUME, after, [`workExperience[id=${we1}].startDate`]);
    expect(out[`workExperience[id=${we1}].company`]!.reviewed).toBe(true);
    expect(out[`workExperience[id=${we1}].startDate`]!.reviewed).toBe(true);
    expect(out[`workExperience[id=${we2}].designation`]).toBeUndefined();
    expect(out["personalInfo.email"]!.reviewed).toBe(false);
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("review screen (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function readyResume() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `review-${randomUUID()}@example.com`,
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
        status: "ready",
        rawText: "x",
      })
      .returning();
    await db.insert(resumeVersions).values({
      resumeId: r!.id,
      kind: "original",
      content: RESUME,
      extractionMeta: META,
      provenance: {},
      contentHash: resumeContentHash(RESUME),
    });
    return { userId, resumeId: r!.id };
  }

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  });

  it("done-when: can't proceed to Generate until every low field is reviewed", async () => {
    const ids = await readyResume();
    expect(await getGenerationReadiness(db, ids)).toMatchObject({
      ready: false,
      unreviewed: expect.arrayContaining([`workExperience[id=${we1}].company`]),
    });

    // Partial review: still blocked.
    const r1 = await saveOriginalReview(db, {
      ...ids,
      content: RESUME,
      reviewedPaths: [`workExperience[id=${we1}].company`],
    });
    expect(r1.unreviewed).toHaveLength(2);
    expect((await getGenerationReadiness(db, ids)).ready).toBe(false);

    // Fix one by editing, confirm the other as-is. Medium flags don't block.
    const edited = clone(RESUME);
    edited.workExperience[0]!.startDate = { value: "2021-01", raw: "Jan 2021" };
    const r2 = await saveOriginalReview(db, {
      ...ids,
      content: edited,
      reviewedPaths: [`workExperience[id=${we2}].designation`],
    });
    expect(r2.unreviewed).toEqual([]);
    expect(await getGenerationReadiness(db, ids)).toEqual({ ready: true, unreviewed: [] });

    const [v] = await db.select().from(resumeVersions).where(eq(resumeVersions.resumeId, ids.resumeId));
    expect(v!.contentHash).toBe(resumeContentHash(edited));
    expect((v!.content as typeof RESUME).workExperience[0]!.startDate.raw).toBe("Jan 2021");
  });

  it("rejects invalid content and leaves the version unchanged", async () => {
    const ids = await readyResume();
    const bad = clone(RESUME) as unknown as { workExperience: { id: string }[] };
    bad.workExperience[1]!.id = bad.workExperience[0]!.id; // duplicate ids
    await expect(
      saveOriginalReview(db, { ...ids, content: bad, reviewedPaths: [] }),
    ).rejects.toMatchObject({ code: "invalid_content" });
    expect((await getGenerationReadiness(db, ids)).unreviewed).toHaveLength(3);
  });

  it("someone else's resume is not found", async () => {
    const ids = await readyResume();
    const other = await readyResume();
    await expect(
      saveOriginalReview(db, { userId: other.userId, resumeId: ids.resumeId, content: RESUME, reviewedPaths: [] }),
    ).rejects.toBeInstanceOf(ReviewError);
    await expect(getGenerationReadiness(db, { userId: other.userId, resumeId: ids.resumeId })).rejects.toMatchObject({ code: "not_found" });
  });
});
