import type { ValidatedUpload } from "@resume-pilot/file-processing";
import { resumeFiles, resumes, type Database } from "@resume-pilot/database";
import { and, asc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

/**
 * Resume uploads — prd.md §5.1–5.3.
 *
 * `createResumeFromUpload` takes an upload that already passed
 * `validateUpload` (magic bytes, size, pages), rejects per-user
 * duplicates by SHA-256, stores the files, then records the `resumes`
 * row (status `uploaded`) and one `resume_files` row per page. Storage
 * is injected so this has no ImageKit dependency.
 *
 * `cleanupExpiredUploads` is the 30-day retention for the original
 * files (ImageKit has no lifecycle rules); run daily by the worker.
 */

export const UPLOAD_RETENTION_DAYS = 30;
/** prd.md §15: 20 uploads per user per day. */
export const UPLOADS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UploadStorage {
  uploadFile(input: {
    userId: string;
    kind: "upload";
    data: Uint8Array;
    extension: string;
  }): Promise<{ storageKey: string; storageFileId: string }>;
  deleteFile(storageFileId: string): Promise<void>;
}

export type UploadErrorReason = "duplicate" | "rate_limited";

export class UploadError extends Error {
  constructor(
    readonly reason: UploadErrorReason,
    message: string,
    /** For duplicates: the resume the user already uploaded with this file. */
    readonly existingResumeId?: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const DUPLICATE_MESSAGE = "You've already uploaded this file.";

async function findByHash(db: Database, userId: string, hash: string) {
  const [row] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.fileHash, hash)));
  return row?.id;
}

export interface CreatedResume {
  resumeId: string;
  format: ValidatedUpload["format"];
  pageCount: number;
}

export async function createResumeFromUpload(
  db: Database,
  storage: UploadStorage,
  input: { userId: string; upload: ValidatedUpload },
  now: Date = new Date(),
): Promise<CreatedResume> {
  const { userId, upload } = input;

  // Cheap checks before spending a storage upload.
  const existing = await findByHash(db, userId, upload.hash);
  if (existing) throw new UploadError("duplicate", DUPLICATE_MESSAGE, existing);

  const [{ today } = { today: 0 }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(resumes)
    .where(
      and(eq(resumes.userId, userId), gte(resumes.createdAt, new Date(now.getTime() - DAY_MS))),
    );
  if (today >= UPLOADS_PER_DAY) {
    throw new UploadError("rate_limited", `You can upload up to ${UPLOADS_PER_DAY} files a day.`);
  }

  const stored: { storageKey: string; storageFileId: string }[] = [];
  try {
    for (const file of upload.files) {
      stored.push(
        await storage.uploadFile({
          userId,
          kind: "upload",
          data: file.data,
          extension: file.extension,
        }),
      );
    }

    return await db.transaction(async (tx) => {
      const [resume] = await tx
        .insert(resumes)
        .values({
          userId,
          fileKey: stored[0]!.storageKey,
          fileName: upload.displayName,
          fileFormat: upload.format,
          fileHash: upload.hash,
          status: "uploaded",
        })
        .returning({ id: resumes.id });
      if (!resume) throw new Error("resumes insert returned no row");

      await tx.insert(resumeFiles).values(
        upload.files.map((file, pageIndex) => ({
          resumeId: resume.id,
          pageIndex,
          storageKey: stored[pageIndex]!.storageKey,
          storageFileId: stored[pageIndex]!.storageFileId,
          mimeType: file.mimeType,
          sizeBytes: file.data.byteLength,
        })),
      );
      return { resumeId: resume.id, format: upload.format, pageCount: upload.pageCount };
    });
  } catch (err) {
    // Don't leave orphaned files behind if anything after the upload failed.
    await Promise.allSettled(stored.map((f) => storage.deleteFile(f.storageFileId)));

    // Two identical uploads at once: the unique (user_id, file_hash) index decides.
    const pg =
      (err as { cause?: { code?: string; constraint_name?: string } })?.cause ??
      (err as { code?: string; constraint_name?: string });
    if (pg?.code === "23505" && pg?.constraint_name === "resumes_user_id_file_hash_key") {
      throw new UploadError(
        "duplicate",
        DUPLICATE_MESSAGE,
        await findByHash(db, userId, upload.hash),
      );
    }
    throw err;
  }
}

/** A user's own uploads, newest first. */
export async function listResumes(db: Database, userId: string) {
  return db
    .select({
      id: resumes.id,
      fileName: resumes.fileName,
      fileFormat: resumes.fileFormat,
      status: resumes.status,
      createdAt: resumes.createdAt,
    })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(sql`${resumes.createdAt} desc`);
}

/**
 * Storage keys of a resume's original files — only if `userId` owns the
 * resume (prd.md §16.2.14). Files already removed by the 30-day cleanup
 * are left out. Returns null when the resume isn't the user's.
 */
export async function getResumeFileKeys(
  db: Database,
  input: { userId: string; resumeId: string },
): Promise<{ pageIndex: number; storageKey: string; mimeType: string }[] | null> {
  const [owned] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId)));
  if (!owned) return null;
  return db
    .select({
      pageIndex: resumeFiles.pageIndex,
      storageKey: resumeFiles.storageKey,
      mimeType: resumeFiles.mimeType,
    })
    .from(resumeFiles)
    .where(and(eq(resumeFiles.resumeId, owned.id), isNotNull(resumeFiles.storageFileId)))
    .orderBy(asc(resumeFiles.pageIndex));
}

export interface CleanupResult {
  deleted: number;
  failed: number;
}

/**
 * Deletes original files of uploads older than 30 days. Only the files
 * go; the `resumes` row and extracted JSON stay until the user deletes
 * them. `storage_file_id` is cleared so a file is never deleted twice.
 */
export async function cleanupExpiredUploads(
  db: Database,
  deleteFile: (storageFileId: string) => Promise<void>,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<CleanupResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - UPLOAD_RETENTION_DAYS * DAY_MS);

  const due = await db
    .select({ id: resumeFiles.id, storageFileId: resumeFiles.storageFileId })
    .from(resumeFiles)
    .innerJoin(resumes, eq(resumes.id, resumeFiles.resumeId))
    .where(and(isNotNull(resumeFiles.storageFileId), lt(resumes.createdAt, cutoff)))
    .orderBy(asc(resumes.createdAt))
    .limit(opts.batchSize ?? 500);

  let deleted = 0;
  let failed = 0;
  for (const row of due) {
    try {
      // File first, then the column: a failed column update just means the
      // next run repeats a delete that's already done, which is idempotent.
      await deleteFile(row.storageFileId!);
      await db.update(resumeFiles).set({ storageFileId: null }).where(eq(resumeFiles.id, row.id));
      deleted++;
    } catch (err) {
      failed++;
      console.error(`[uploads] failed to delete file ${row.id}:`, err);
    }
  }
  return { deleted, failed };
}
