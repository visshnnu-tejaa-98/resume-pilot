import { resumeFiles, resumes, type Database } from "@resume-pilot/database";
import { ExtractionError, type ExtractionResult } from "@resume-pilot/file-processing";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * Raw-text extraction for an uploaded resume — prd.md §5.3 steps 3–7,
 * run by the worker. Status goes uploaded → processing → processed, or
 * → failed with a user-facing reason the user can retry from.
 *
 * Free step: this never touches the wallet (no holds, no ledger). The
 * AI cost of the later JSON step (M4) is a platform cost (§3.2).
 *
 * Dependencies are injected (file download and the extractor itself),
 * so services has no ImageKit or OCR dependency.
 */

export interface ExtractionDeps {
  readFile(input: { userId: string; storageKey: string }): Promise<Uint8Array>;
  extract(
    format: (typeof resumes.$inferSelect)["fileFormat"],
    files: Uint8Array[],
  ): Promise<ExtractionResult>;
  /** True on the job's last attempt: a transient error then fails the resume instead of retrying. */
  isFinalAttempt: boolean;
}

export type ExtractionOutcome =
  | { status: "processed"; chars: number }
  | { status: "failed"; reason: string; message: string }
  | { status: "skipped"; reason: string };

/** Shown when the failure was ours (storage/OCR crashed), not the file's. */
export const TEMPORARY_FAILURE_MESSAGE =
  "Something went wrong reading your file. Retry, and if it keeps failing, upload it again.";

export async function processExtraction(
  db: Database,
  resumeId: string,
  deps: ExtractionDeps,
  now: Date = new Date(),
): Promise<ExtractionOutcome> {
  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  if (!resume) return { status: "skipped", reason: "resume not found" };
  if (resume.status === "processed") return { status: "skipped", reason: "already processed" };

  await db
    .update(resumes)
    .set({ status: "processing", extractionError: null, updatedAt: now })
    .where(eq(resumes.id, resumeId));

  const fail = async (reason: string, message: string): Promise<ExtractionOutcome> => {
    await db
      .update(resumes)
      .set({ status: "failed", extractionError: message, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    return { status: "failed", reason, message };
  };

  const files = await db
    .select({ storageKey: resumeFiles.storageKey })
    .from(resumeFiles)
    .where(and(eq(resumeFiles.resumeId, resumeId), isNotNull(resumeFiles.storageFileId)))
    .orderBy(asc(resumeFiles.pageIndex));
  if (files.length === 0) {
    // Originals are deleted after 30 days; nothing left to read.
    return fail("files_gone", "The original file is no longer available. Upload it again.");
  }

  try {
    const data = await Promise.all(
      files.map((f) => deps.readFile({ userId: resume.userId, storageKey: f.storageKey })),
    );
    const result = await deps.extract(resume.fileFormat, data);
    await db
      .update(resumes)
      .set({
        status: "processed",
        rawText: result.text,
        extractionMeta: { pages: result.pages },
        extractionError: null,
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, resumeId));
    return { status: "processed", chars: result.text.length };
  } catch (err) {
    // A problem with the file itself: retrying won't help.
    if (err instanceof ExtractionError) return fail(err.reason, err.message);
    if (deps.isFinalAttempt) return fail("temporary", TEMPORARY_FAILURE_MESSAGE);
    // Transient (storage/OCR hiccup): back to uploaded, let the queue retry.
    await db
      .update(resumes)
      .set({ status: "uploaded", updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    throw err;
  }
}

export class RetryExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryExtractionError";
  }
}

/**
 * User-triggered retry (§5.3: "any failure shows an error and a retry
 * option"). Only the owner, only from `failed`. Resets to `uploaded`;
 * the caller enqueues the job.
 */
export async function markExtractionForRetry(
  db: Database,
  input: { userId: string; resumeId: string },
): Promise<{ step: "extract" | "structure" }> {
  // If text extraction already succeeded, only the JSON step needs re-running.
  const [current] = await db
    .select({ rawText: resumes.rawText })
    .from(resumes)
    .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId)));
  const step = current?.rawText ? "structure" : "extract";
  const [row] = await db
    .update(resumes)
    .set({
      status: step === "structure" ? "processed" : "uploaded",
      extractionError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(resumes.id, input.resumeId),
        eq(resumes.userId, input.userId),
        inArray(resumes.status, ["failed"]),
      ),
    )
    .returning({ id: resumes.id });
  if (!row) throw new RetryExtractionError("Only a failed upload of yours can be retried.");
  return { step };
}

/**
 * Marks an upload failed when its extraction job couldn't even be
 * queued (Redis down), so the user sees an error and a Retry button
 * instead of a resume stuck at "uploaded".
 */
export async function failExtraction(
  db: Database,
  resumeId: string,
  message = TEMPORARY_FAILURE_MESSAGE,
) {
  await db
    .update(resumes)
    .set({ status: "failed", extractionError: message, updatedAt: new Date() })
    .where(eq(resumes.id, resumeId));
}
