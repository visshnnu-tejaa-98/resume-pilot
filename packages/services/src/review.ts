import { atsReports, resumes, resumeVersions, type Database } from "@resume-pilot/database";
import {
  extractionMetaSchema,
  resumeSchema,
  unreviewedLowConfidence,
  valueAtPath,
  type ExtractionMeta,
  type Resume,
} from "@resume-pilot/validators/resume";
import { and, eq, ne } from "drizzle-orm";
import { resumeContentHash } from "./structuring";

/**
 * The "Resume Information" review screen — prd.md §5.3 step 7, §6.2, §8.6.
 *
 * The user fixes anything extraction got wrong and confirms flagged
 * fields. A flagged field counts as reviewed when the user marks it
 * ("looks right") or edits it: a manual edit is the user's own claim
 * (§8.6), so there's nothing left for them to check. Flags on items the
 * user deleted are dropped.
 *
 * Generation is gated on `getGenerationReadiness`: every `low` field
 * must be reviewed first.
 */

export type ReviewErrorCode = "not_found" | "invalid_content";

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

async function loadOriginal(db: Database, input: { userId: string; resumeId: string }) {
  const [row] = await db
    .select({ id: resumeVersions.id, content: resumeVersions.content, meta: resumeVersions.extractionMeta })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(
      and(
        eq(resumeVersions.resumeId, input.resumeId),
        eq(resumes.userId, input.userId),
        eq(resumeVersions.kind, "original"),
      ),
    );
  if (!row) throw new ReviewError("not_found", "Resume not found");
  return row;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Applies the user's edits and "looks right" marks to the flags. Pure; exported for tests. */
export function reconcileFlags(
  meta: ExtractionMeta,
  before: Resume,
  after: Resume,
  reviewedPaths: readonly string[],
): ExtractionMeta {
  const marked = new Set(reviewedPaths);
  const out: ExtractionMeta = {};
  for (const [path, flag] of Object.entries(meta)) {
    const now = valueAtPath(after, path);
    if (now === undefined) continue; // item deleted: nothing left to check
    const edited = !same(valueAtPath(before, path), now);
    out[path] = { ...flag, reviewed: flag.reviewed || marked.has(path) || edited };
  }
  return out;
}

export async function saveOriginalReview(
  db: Database,
  input: { userId: string; resumeId: string; content: unknown; reviewedPaths: string[] },
): Promise<{ unreviewed: string[]; extractionMeta: ExtractionMeta }> {
  const original = await loadOriginal(db, input);
  const parsed = resumeSchema.safeParse(input.content);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ReviewError(
      "invalid_content",
      first ? `${first.path.join(".") || "resume"}: ${first.message}` : "Invalid resume",
    );
  }
  const before = resumeSchema.parse(original.content);
  const meta = reconcileFlags(
    extractionMetaSchema.parse(original.meta ?? {}),
    before,
    parsed.data,
    input.reviewedPaths,
  );

  await db
    .update(resumeVersions)
    .set({
      content: parsed.data,
      extractionMeta: meta,
      contentHash: resumeContentHash(parsed.data),
      updatedAt: new Date(),
    })
    .where(eq(resumeVersions.id, original.id));
  // §9.3: an edit makes any score of the old content outdated (history is kept).
  const newHash = resumeContentHash(parsed.data);
  await db
    .update(atsReports)
    .set({ status: "outdated" })
    .where(and(eq(atsReports.versionId, original.id), ne(atsReports.contentHash, newHash)));

  return { unreviewed: unreviewedLowConfidence(meta), extractionMeta: meta };
}

/** Whether the original may be used to generate (§5.3 step 7): no unreviewed `low` flags. */
export async function getGenerationReadiness(
  db: Database,
  input: { userId: string; resumeId: string },
): Promise<{ ready: boolean; unreviewed: string[] }> {
  const original = await loadOriginal(db, input);
  const unreviewed = unreviewedLowConfidence(extractionMetaSchema.parse(original.meta ?? {}));
  return { ready: unreviewed.length === 0, unreviewed };
}
