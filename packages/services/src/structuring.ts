import { createHash } from "node:crypto";
import { resumes, resumeVersions, type Database } from "@resume-pilot/database";
import {
  flagExtraction,
  resumeSchema,
  type LowConfidenceLineInput,
  type Resume,
} from "@resume-pilot/validators/resume";
import { and, eq } from "drizzle-orm";

/**
 * Raw text → the resume's original version — prd.md §5.3 steps 4–7,
 * run by the worker after text extraction. Status processed →
 * structuring → ready; the original version and `ready` are written in
 * one transaction, so there's never a half-saved resume.
 *
 * Free to the user: no wallet, no ai_jobs row. Token usage is recorded
 * on the resume's extraction_meta as a platform cost.
 *
 * The model call is injected (packages/ai), so this has no OpenAI
 * dependency and tests use a fake.
 */

export interface StructuringDeps {
  structure(rawText: string): Promise<{
    resume: Resume;
    model: string;
    promptVersion: string;
    usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
  }>;
  isFinalAttempt: boolean;
}

export type StructuringOutcome =
  | { status: "ready"; versionId: string; flagged: number }
  | { status: "failed"; message: string }
  | { status: "skipped"; reason: string };

export const STRUCTURING_FAILED_MESSAGE =
  "We couldn't work out the sections of your resume. Retry, or upload a cleaner copy (a PDF exported from Word or Google Docs works best).";

/** sha256 of the content with keys sorted, so equal resumes hash equally (§9.1 cache key). */
export function resumeContentHash(resume: Resume): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(stable(resume)))
    .digest("hex");
}

/** When the fault is ours (no key, OpenAI down), not the file's. */
export const STRUCTURING_TEMPORARY_MESSAGE =
  "Something went wrong on our side while reading your resume. Please retry in a few minutes.";

/** StructuringError kinds that aren't about the file (packages/ai). */
const OUR_FAULT = new Set(["config_error", "api_error"]);

/** Whether an error is worth another attempt (StructuringError carries `retryable`). */
function isRetryable(err: unknown): boolean {
  const r = (err as { retryable?: unknown })?.retryable;
  return typeof r === "boolean" ? r : true;
}

export async function processStructuring(
  db: Database,
  resumeId: string,
  deps: StructuringDeps,
): Promise<StructuringOutcome> {
  const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  if (!resume) return { status: "skipped", reason: "resume not found" };
  if (resume.status === "ready") return { status: "skipped", reason: "already ready" };
  if (!resume.rawText) return { status: "skipped", reason: "no raw text yet" };

  const [existing] = await db
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .where(and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.kind, "original")));
  if (existing) {
    // A previous attempt saved it; just make sure the status says so.
    await db
      .update(resumes)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    return { status: "skipped", reason: "original already saved" };
  }

  await db
    .update(resumes)
    .set({ status: "structuring", extractionError: null, updatedAt: new Date() })
    .where(eq(resumes.id, resumeId));

  const fail = async (message: string): Promise<StructuringOutcome> => {
    await db
      .update(resumes)
      .set({ status: "failed", extractionError: message, updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    return { status: "failed", message };
  };

  let result: Awaited<ReturnType<StructuringDeps["structure"]>>;
  try {
    result = await deps.structure(resume.rawText);
  } catch (err) {
    if (!isRetryable(err) || deps.isFinalAttempt) {
      console.error(`[structuring] resume ${resumeId} failed:`, (err as Error).message);
      const ours = OUR_FAULT.has(String((err as { kind?: unknown })?.kind));
      return fail(ours ? STRUCTURING_TEMPORARY_MESSAGE : STRUCTURING_FAILED_MESSAGE);
    }
    // Transient: back to processed (raw text is fine) and let the queue retry.
    await db
      .update(resumes)
      .set({ status: "processed", updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    throw err;
  }

  // Belt and braces: whatever `structure` returns must be schema 2.0.
  const content = resumeSchema.safeParse(result.resume);
  if (!content.success) {
    if (deps.isFinalAttempt) return fail(STRUCTURING_FAILED_MESSAGE);
    await db
      .update(resumes)
      .set({ status: "processed", updatedAt: new Date() })
      .where(eq(resumes.id, resumeId));
    throw new Error(`Structured resume failed validation: ${content.error.message}`);
  }

  const extraction = (resume.extractionMeta ?? {}) as {
    pages?: { lowConfidenceLines?: LowConfidenceLineInput[] }[];
    [key: string]: unknown;
  };
  const lowConfidenceLines = (extraction.pages ?? []).flatMap((p) => p.lowConfidenceLines ?? []);
  const flags = flagExtraction(content.data, { rawText: resume.rawText, lowConfidenceLines });

  const versionId = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(resumeVersions)
      .values({
        resumeId,
        kind: "original",
        content: content.data,
        extractionMeta: flags,
        provenance: {},
        contentHash: resumeContentHash(content.data),
      })
      .onConflictDoNothing()
      .returning({ id: resumeVersions.id });

    // Lost a race with a concurrent attempt: theirs is saved, use it.
    const id =
      version?.id ??
      (
        await tx
          .select({ id: resumeVersions.id })
          .from(resumeVersions)
          .where(and(eq(resumeVersions.resumeId, resumeId), eq(resumeVersions.kind, "original")))
      )[0]!.id;

    await tx
      .update(resumes)
      .set({
        status: "ready",
        extractionError: null,
        extractionMeta: {
          ...extraction,
          structuring: {
            model: result.model,
            promptVersion: result.promptVersion,
            usage: result.usage,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, resumeId));
    return id;
  });

  return { status: "ready", versionId, flagged: Object.keys(flags).length };
}

/** The original version of a user's own resume, with its review flags (null if not theirs / not ready). */
export async function getOriginalVersion(
  db: Database,
  input: { userId: string; resumeId: string },
) {
  const [row] = await db
    .select({
      versionId: resumeVersions.id,
      content: resumeVersions.content,
      extractionMeta: resumeVersions.extractionMeta,
      createdAt: resumeVersions.createdAt,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(
      and(
        eq(resumeVersions.resumeId, input.resumeId),
        eq(resumes.userId, input.userId),
        eq(resumeVersions.kind, "original"),
      ),
    );
  return row ?? null;
}
