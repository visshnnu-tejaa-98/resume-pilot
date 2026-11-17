import { atsReports, jobDescriptions, resumes, resumeTemplates, resumeVersions, type Database } from "@resume-pilot/database";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { resumeContentHash } from "./structuring";

/**
 * Resume versions — prd.md §8.5, §8.6.
 *
 * - The original and every generated version are separate rows; AI never
 *   overwrites one. A generated version's `parentVersionId` points at the
 *   snapshot it was built from, and its content is its own copy, so
 *   editing the original later never changes it (acceptance 16.2.9).
 * - Every version can be edited by hand (the user's own claims, §8.6),
 *   duplicated (no AI, no charge) and soft-deleted with a 30-day restore.
 * - Every query is scoped to the caller via `resumes.user_id`.
 */

export const VERSION_RESTORE_DAYS = 30;
const RESTORE_MS = VERSION_RESTORE_DAYS * 86_400_000;

export class VersionError extends Error {
  constructor(
    readonly code: "not_found" | "original" | "restore_expired" | "invalid",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "VersionError";
  }
}

export interface GenerationMeta {
  aiJobId?: string;
  gaps?: { requirementId: string | null; keyword: string; note: string }[];
  model?: string;
  promptVersion?: string;
  attempts?: number;
  /** Rule → count, for violations the automatic retry fixed (admin metric). */
  firstAttemptViolations?: Record<string, number>;
  duplicatedFrom?: string;
}

const cols = {
  id: resumeVersions.id,
  resumeId: resumeVersions.resumeId,
  kind: resumeVersions.kind,
  parentVersionId: resumeVersions.parentVersionId,
  jdId: resumeVersions.jdId,
  generationMeta: resumeVersions.generationMeta,
  /** Chosen template key (resume_templates.key); null = default (Classic). */
  templateKey: sql<string | null>`(select ${resumeTemplates.key} from ${resumeTemplates} where ${resumeTemplates.id} = ${resumeVersions.templateId})`,
  deletedAt: resumeVersions.deletedAt,
  createdAt: resumeVersions.createdAt,
  updatedAt: resumeVersions.updatedAt,
  fileName: resumes.fileName,
  companyName: jobDescriptions.companyName,
  jobTitle: jobDescriptions.jobTitle,
  /** Latest cached ATS score for this version, if any (m7). */
  score: sql<number | null>`(select ${atsReports.overallScore} from ${atsReports} where ${atsReports.versionId} = ${resumeVersions.id} order by ${atsReports.createdAt} desc limit 1)`,
  scoreOutdated: sql<boolean>`coalesce((select ${atsReports.status} = 'outdated' from ${atsReports} where ${atsReports.versionId} = ${resumeVersions.id} order by ${atsReports.createdAt} desc limit 1), false)`,
};

/** Every live version the user owns, newest first (My resumes). */
export async function listVersions(db: Database, userId: string) {
  return db
    .select(cols)
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .leftJoin(jobDescriptions, eq(jobDescriptions.id, resumeVersions.jdId))
    .where(and(eq(resumes.userId, userId), isNull(resumeVersions.deletedAt)))
    .orderBy(desc(resumeVersions.updatedAt));
}

/** Soft-deleted versions still inside the restore window. */
export async function listDeletedVersions(db: Database, userId: string, now = new Date()) {
  return db
    .select(cols)
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .leftJoin(jobDescriptions, eq(jobDescriptions.id, resumeVersions.jdId))
    .where(and(eq(resumes.userId, userId), isNotNull(resumeVersions.deletedAt), sql`${resumeVersions.deletedAt} > ${new Date(now.getTime() - RESTORE_MS)}`))
    .orderBy(desc(resumeVersions.deletedAt));
}

async function owned(db: Pick<Database, "select">, userId: string, versionId: string, opts: { includeDeleted?: boolean } = {}) {
  const [row] = await db
    .select({ ...cols, content: resumeVersions.content, provenance: resumeVersions.provenance })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .leftJoin(jobDescriptions, eq(jobDescriptions.id, resumeVersions.jdId))
    .where(and(eq(resumeVersions.id, versionId), eq(resumes.userId, userId), opts.includeDeleted ? undefined : isNull(resumeVersions.deletedAt)));
  if (!row) throw new VersionError("not_found", "Version not found");
  return row;
}

/** One version with its content (editor, preview, generation source). */
export async function getVersion(db: Database, input: { userId: string; versionId: string }) {
  const row = await owned(db, input.userId, input.versionId);
  return { ...row, content: resumeSchema.parse(row.content) as Resume };
}

/**
 * Save a hand edit (§8.6). Original versions are edited through the
 * review screen (it also tracks extraction flags), so this is for
 * generated versions. Any cached ATS score becomes outdated (§9).
 */
export async function saveVersionContent(db: Database, input: { userId: string; versionId: string; content: unknown; template?: string }) {
  const row = await owned(db, input.userId, input.versionId);
  if (input.template !== undefined) await setVersionTemplate(db, { userId: input.userId, versionId: row.id, template: input.template });
  if (row.kind === "original") throw new VersionError("original", "Edit the original from its review screen");
  const parsed = resumeSchema.safeParse(input.content);
  if (!parsed.success) throw new VersionError("invalid", parsed.error.issues[0]?.message ?? "Invalid resume", { cause: parsed.error });
  const contentHash = resumeContentHash(parsed.data);
  await db.transaction(async (tx) => {
    await tx.update(resumeVersions).set({ content: parsed.data, contentHash, updatedAt: new Date() }).where(eq(resumeVersions.id, row.id));
    await tx.update(atsReports).set({ status: "outdated" }).where(and(eq(atsReports.versionId, row.id), sql`${atsReports.contentHash} <> ${contentHash}`));
  });
  return { contentHash };
}

/**
 * Pick the template (§10.2). Presentation only: content and its hash are
 * untouched, so it's allowed on the original too and never outdates a score.
 */
export async function setVersionTemplate(db: Database, input: { userId: string; versionId: string; template: string }) {
  const row = await owned(db, input.userId, input.versionId);
  const [t] = await db.select({ id: resumeTemplates.id }).from(resumeTemplates).where(and(eq(resumeTemplates.key, input.template), eq(resumeTemplates.active, true)));
  if (!t) throw new VersionError("invalid", "That template isn't available");
  await db.update(resumeVersions).set({ templateId: t.id }).where(eq(resumeVersions.id, row.id));
  return { template: input.template };
}

/** Duplicate: a copy with no AI call and no charge (§8.5). */
export async function duplicateVersion(db: Database, input: { userId: string; versionId: string }) {
  const row = await owned(db, input.userId, input.versionId);
  const content = resumeSchema.parse(row.content);
  const meta = (row.generationMeta ?? {}) as GenerationMeta;
  const [copy] = await db
    .insert(resumeVersions)
    .values({
      resumeId: row.resumeId,
      kind: "generated",
      content,
      provenance: row.provenance,
      parentVersionId: row.id,
      jdId: row.jdId,
      contentHash: resumeContentHash(content),
      templateId: sql`(select ${resumeTemplates.id} from ${resumeTemplates} where ${resumeTemplates.key} = ${row.templateKey})`,
      generationMeta: { gaps: meta.gaps ?? [], duplicatedFrom: row.id } satisfies GenerationMeta,
    })
    .returning({ id: resumeVersions.id });
  return { versionId: copy!.id };
}

/** Soft delete (§8.5). The original goes with its upload, not from here. */
export async function deleteVersion(db: Database, input: { userId: string; versionId: string }, now = new Date()) {
  const row = await owned(db, input.userId, input.versionId);
  if (row.kind === "original") throw new VersionError("original", "Delete the whole resume to remove its original");
  await db.update(resumeVersions).set({ deletedAt: now, updatedAt: now }).where(eq(resumeVersions.id, row.id));
  return { restorableUntil: new Date(now.getTime() + RESTORE_MS) };
}

export async function restoreVersion(db: Database, input: { userId: string; versionId: string }, now = new Date()) {
  const row = await owned(db, input.userId, input.versionId, { includeDeleted: true });
  if (!row.deletedAt) return { restored: false };
  if (now.getTime() - row.deletedAt.getTime() > RESTORE_MS) throw new VersionError("restore_expired", `Versions can be restored for ${VERSION_RESTORE_DAYS} days after deletion`);
  await db.update(resumeVersions).set({ deletedAt: null, updatedAt: now }).where(eq(resumeVersions.id, row.id));
  return { restored: true };
}

/**
 * Maintenance: hard-delete versions soft-deleted more than 30 days ago.
 * Children that pointed at them keep their own content; their parent
 * link is cleared first (the FK has no cascade).
 */
export async function purgeDeletedVersions(db: Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - RESTORE_MS);
  return db.transaction(async (tx) => {
    const doomed = tx.select({ id: resumeVersions.id }).from(resumeVersions).where(and(isNotNull(resumeVersions.deletedAt), lt(resumeVersions.deletedAt, cutoff)));
    await tx.update(resumeVersions).set({ parentVersionId: null }).where(sql`${resumeVersions.parentVersionId} in (${doomed})`);
    await tx.delete(atsReports).where(sql`${atsReports.versionId} in (${doomed})`);
    const deleted = await tx.delete(resumeVersions).where(and(isNotNull(resumeVersions.deletedAt), lt(resumeVersions.deletedAt, cutoff))).returning({ id: resumeVersions.id });
    return { purged: deleted.length };
  });
}
