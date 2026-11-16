import { resumes, type Database } from "@resume-pilot/database";
import { and, asc, eq, isNotNull, lt } from "drizzle-orm";

/**
 * 30-day retention for original uploads — prd.md §5.2, §15. ImageKit
 * has no lifecycle rules, so the worker runs this daily. Only the file
 * is deleted; the `resumes` row and its extracted JSON stay until the
 * user deletes them. `storage_file_id` is cleared so a file is never
 * deleted twice and the row shows the original is gone.
 */

export const UPLOAD_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: number;
  failed: number;
}

export async function cleanupExpiredUploads(
  db: Database,
  deleteFile: (storageFileId: string) => Promise<void>,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<CleanupResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - UPLOAD_RETENTION_DAYS * DAY_MS);
  const batchSize = opts.batchSize ?? 500;

  const due = await db
    .select({ id: resumes.id, storageFileId: resumes.storageFileId })
    .from(resumes)
    .where(and(isNotNull(resumes.storageFileId), lt(resumes.createdAt, cutoff)))
    .orderBy(asc(resumes.createdAt))
    .limit(batchSize);

  let deleted = 0;
  let failed = 0;
  for (const row of due) {
    try {
      // File first, then the column: if the column update fails, the next
      // run retries a delete that's already done, which is idempotent.
      await deleteFile(row.storageFileId!);
      await db
        .update(resumes)
        .set({ storageFileId: null, updatedAt: now })
        .where(eq(resumes.id, row.id));
      deleted++;
    } catch (err) {
      // One bad file mustn't stop the rest; it's retried tomorrow.
      failed++;
      console.error(`[uploads] failed to delete upload for resume ${row.id}:`, err);
    }
  }
  return { deleted, failed };
}
