import { randomUUID } from "node:crypto";
import { createDatabase, resumes, users, type Database } from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupExpiredUploads } from "./uploads";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!connectionString)("cleanupExpiredUploads (real DB)", () => {
  let db: Database;
  let userId: string;
  const now = new Date();

  async function resumeAgedDays(
    days: number,
    storageFileId: string | null = `file_${randomUUID()}`,
  ) {
    const [row] = await db
      .insert(resumes)
      .values({
        userId,
        fileKey: `/users/${userId}/uploads/${randomUUID()}.pdf`,
        storageFileId,
        fileName: "resume.pdf",
        fileFormat: "pdf",
        fileHash: randomUUID(),
        createdAt: new Date(now.getTime() - days * DAY),
      })
      .returning();
    return row!;
  }

  const fileIdOf = async (id: string) =>
    (await db.select().from(resumes).where(eq(resumes.id, id)))[0]?.storageFileId;

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    ({ userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `uploads-${randomUUID()}@example.com`,
    }));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  });

  it("deletes a 31-day-old upload and leaves a 29-day-old one alone", async () => {
    const old = await resumeAgedDays(31);
    const recent = await resumeAgedDays(29);
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    await cleanupExpiredUploads(db, deleteFile, { now });

    expect(deleteFile).toHaveBeenCalledWith(old.storageFileId);
    expect(deleteFile).not.toHaveBeenCalledWith(recent.storageFileId);
    expect(await fileIdOf(old.id)).toBeNull();
    expect(await fileIdOf(recent.id)).toBe(recent.storageFileId);
    // The resume row (and its extracted JSON) stays.
    expect((await db.select().from(resumes).where(eq(resumes.id, old.id))).length).toBe(1);
  });

  it("never deletes the same file twice", async () => {
    const old = await resumeAgedDays(40);
    const deleteFile = vi.fn().mockResolvedValue(undefined);

    await cleanupExpiredUploads(db, deleteFile, { now });
    deleteFile.mockClear();
    await cleanupExpiredUploads(db, deleteFile, { now });

    expect(deleteFile).not.toHaveBeenCalledWith(old.storageFileId);
  });

  it("one failed delete doesn't stop the rest, and is retried next run", async () => {
    const bad = await resumeAgedDays(35);
    const good = await resumeAgedDays(36);
    const deleteFile = vi.fn(async (id: string) => {
      if (id === bad.storageFileId) throw new Error("ImageKit 503");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cleanupExpiredUploads(db, deleteFile, { now });
    spy.mockRestore();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(await fileIdOf(good.id)).toBeNull();
    expect(await fileIdOf(bad.id)).toBe(bad.storageFileId);

    deleteFile.mockImplementation(async () => {});
    await cleanupExpiredUploads(db, deleteFile, { now });
    expect(await fileIdOf(bad.id)).toBeNull();
  });

  it("skips rows whose file is already gone", async () => {
    const already = await resumeAgedDays(50, null);
    const deleteFile = vi.fn();
    await cleanupExpiredUploads(db, deleteFile, { now });
    expect(await fileIdOf(already.id)).toBeNull();
    const ids = (
      await db
        .select()
        .from(resumes)
        .where(inArray(resumes.id, [already.id]))
    ).length;
    expect(ids).toBe(1);
  });
});
