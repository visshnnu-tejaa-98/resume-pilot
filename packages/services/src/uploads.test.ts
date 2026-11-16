import { randomUUID } from "node:crypto";
import { createDatabase, resumeFiles, resumes, users, type Database } from "@resume-pilot/database";
import { validateUpload } from "@resume-pilot/file-processing";
import { makeJpg, makePdf, makePng } from "@resume-pilot/file-processing/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanupExpiredUploads,
  createResumeFromUpload,
  getResumeFileKeys,
  listResumes,
  UploadError,
  UPLOADS_PER_DAY,
  type UploadStorage,
} from "./uploads";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;
const DAY = 24 * 60 * 60 * 1000;

/** In-memory stand-in for the ImageKit wrapper. */
function fakeStorage() {
  const files = new Map<string, string>();
  const storage = {
    uploadFile: vi.fn(async ({ userId, extension }: { userId: string; extension: string }) => {
      const storageFileId = `file_${randomUUID()}`;
      const storageKey = `/users/${userId}/uploads/${randomUUID()}.${extension}`;
      files.set(storageFileId, storageKey);
      return { storageKey, storageFileId };
    }),
    deleteFile: vi.fn(async (id: string) => {
      files.delete(id);
    }),
  } satisfies UploadStorage;
  return { storage, files };
}

describe.skipIf(!connectionString)("uploads (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];

  async function newUser() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `uploads-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return userId;
  }

  const pdfUpload = (pages = 1, salt = randomUUID()) =>
    // Unique bytes per call (a trailing comment), so tests don't collide on the hash.
    validateUpload([
      {
        name: "Resume.pdf",
        data: Buffer.concat([Buffer.from(makePdf(pages)), Buffer.from(`%${salt}\n`)]),
      },
    ]);

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  });

  describe("createResumeFromUpload", () => {
    it("stores the file and records the resume (status uploaded) with its file row", async () => {
      const userId = await newUser();
      const { storage, files } = fakeStorage();
      const upload = await pdfUpload(2);

      const created = await createResumeFromUpload(db, storage, { userId, upload });

      expect(created).toMatchObject({ format: "pdf", pageCount: 2 });
      expect(files.size).toBe(1);
      const [resume] = await db.select().from(resumes).where(eq(resumes.id, created.resumeId));
      expect(resume).toMatchObject({
        userId,
        status: "uploaded",
        fileName: "Resume.pdf",
        fileHash: upload.hash,
      });
      const rows = await db
        .select()
        .from(resumeFiles)
        .where(eq(resumeFiles.resumeId, created.resumeId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        pageIndex: 0,
        mimeType: "application/pdf",
        storageKey: resume!.fileKey,
      });
    });

    it("stores up to 5 images as ordered pages of one resume", async () => {
      const userId = await newUser();
      const { storage } = fakeStorage();
      const upload = await validateUpload([
        { name: "p1.png", data: makePng(11) },
        { name: "p2.jpg", data: makeJpg() },
        { name: "p3.png", data: makePng(13) },
      ]);

      const { resumeId } = await createResumeFromUpload(db, storage, { userId, upload });

      const rows = await db.select().from(resumeFiles).where(eq(resumeFiles.resumeId, resumeId));
      expect(rows.map((r) => [r.pageIndex, r.mimeType]).sort()).toEqual([
        [0, "image/png"],
        [1, "image/jpeg"],
        [2, "image/png"],
      ]);
    });

    it("done-when: re-uploading the same file is a duplicate, and nothing new is stored", async () => {
      const userId = await newUser();
      const { storage, files } = fakeStorage();
      const upload = await pdfUpload();
      const first = await createResumeFromUpload(db, storage, { userId, upload });

      const again = createResumeFromUpload(db, storage, { userId, upload });
      await expect(again).rejects.toBeInstanceOf(UploadError);
      await expect(again).rejects.toMatchObject({
        reason: "duplicate",
        existingResumeId: first.resumeId,
      });
      expect(files.size).toBe(1);
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    });

    it("the same file from a different user is not a duplicate", async () => {
      const { storage } = fakeStorage();
      const upload = await pdfUpload();
      await createResumeFromUpload(db, storage, { userId: await newUser(), upload });
      await expect(
        createResumeFromUpload(db, storage, { userId: await newUser(), upload }),
      ).resolves.toBeTruthy();
    });

    it("two identical uploads at once: one wins, the other is a duplicate and its file is cleaned up", async () => {
      const userId = await newUser();
      const { storage, files } = fakeStorage();
      const upload = await pdfUpload();

      const results = await Promise.allSettled([
        createResumeFromUpload(db, storage, { userId, upload }),
        createResumeFromUpload(db, storage, { userId, upload }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ reason: "duplicate" });
      expect(files.size).toBe(1); // the loser's stored file was deleted
    });

    it("deletes stored files if the DB write fails (no orphans)", async () => {
      const { storage, files } = fakeStorage();
      const upload = await pdfUpload();
      // A user id with no users row makes the resumes insert fail on its FK.
      await expect(
        createResumeFromUpload(db, storage, { userId: randomUUID(), upload }),
      ).rejects.toThrow();
      expect(files.size).toBe(0);
    });

    it(`allows ${UPLOADS_PER_DAY} uploads a day`, async () => {
      const userId = await newUser();
      const { storage } = fakeStorage();
      const old = new Date(Date.now() - 2 * DAY);
      await db.insert(resumes).values(
        Array.from({ length: UPLOADS_PER_DAY }, () => ({
          userId,
          fileKey: "k",
          fileName: "x.pdf",
          fileFormat: "pdf" as const,
          fileHash: randomUUID(),
        })),
      );
      await expect(
        createResumeFromUpload(db, storage, { userId, upload: await pdfUpload() }),
      ).rejects.toMatchObject({
        reason: "rate_limited",
      });
      // Uploads older than a day don't count.
      await db.update(resumes).set({ createdAt: old }).where(eq(resumes.userId, userId));
      await expect(
        createResumeFromUpload(db, storage, { userId, upload: await pdfUpload() }),
      ).resolves.toBeTruthy();
    });
  });

  describe("listResumes / getResumeFileKeys", () => {
    it("only ever return the caller's own resumes and files", async () => {
      const owner = await newUser();
      const other = await newUser();
      const { storage } = fakeStorage();
      const { resumeId } = await createResumeFromUpload(db, storage, {
        userId: owner,
        upload: await pdfUpload(),
      });

      expect((await listResumes(db, owner)).map((r) => r.id)).toContain(resumeId);
      expect(await listResumes(db, other)).toEqual([]);
      expect(await getResumeFileKeys(db, { userId: owner, resumeId })).toHaveLength(1);
      expect(await getResumeFileKeys(db, { userId: other, resumeId })).toBeNull();
    });
  });

  describe("cleanupExpiredUploads", () => {
    async function resumeAgedDays(userId: string, days: number) {
      const { storage } = fakeStorage();
      const { resumeId } = await createResumeFromUpload(db, storage, {
        userId,
        upload: await pdfUpload(),
      });
      await db
        .update(resumes)
        .set({ createdAt: new Date(Date.now() - days * DAY) })
        .where(eq(resumes.id, resumeId));
      const [file] = await db.select().from(resumeFiles).where(eq(resumeFiles.resumeId, resumeId));
      return { resumeId, fileRowId: file!.id, storageFileId: file!.storageFileId! };
    }
    const fileIdOf = async (fileRowId: string) =>
      (await db.select().from(resumeFiles).where(eq(resumeFiles.id, fileRowId)))[0]?.storageFileId;

    it("deletes a 31-day-old upload's files and leaves a 29-day-old one alone", async () => {
      const userId = await newUser();
      const old = await resumeAgedDays(userId, 31);
      const recent = await resumeAgedDays(userId, 29);
      const deleteFile = vi.fn().mockResolvedValue(undefined);

      await cleanupExpiredUploads(db, deleteFile);

      expect(deleteFile).toHaveBeenCalledWith(old.storageFileId);
      expect(deleteFile).not.toHaveBeenCalledWith(recent.storageFileId);
      expect(await fileIdOf(old.fileRowId)).toBeNull();
      expect(await fileIdOf(recent.fileRowId)).toBe(recent.storageFileId);
      // The resume row stays; its files just aren't offered for download any more.
      expect(await getResumeFileKeys(db, { userId, resumeId: old.resumeId })).toEqual([]);
    });

    it("never deletes twice; one failure doesn't stop the rest and is retried next run", async () => {
      const userId = await newUser();
      const bad = await resumeAgedDays(userId, 35);
      const good = await resumeAgedDays(userId, 36);
      const deleteFile = vi.fn(async (id: string) => {
        if (id === bad.storageFileId) throw new Error("ImageKit 503");
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      await cleanupExpiredUploads(db, deleteFile);
      expect(await fileIdOf(good.fileRowId)).toBeNull();
      expect(await fileIdOf(bad.fileRowId)).toBe(bad.storageFileId);

      deleteFile.mockClear();
      deleteFile.mockImplementation(async () => {});
      await cleanupExpiredUploads(db, deleteFile);
      spy.mockRestore();
      expect(deleteFile).toHaveBeenCalledWith(bad.storageFileId);
      expect(deleteFile).not.toHaveBeenCalledWith(good.storageFileId);
      expect(await fileIdOf(bad.fileRowId)).toBeNull();
    });
  });
});
