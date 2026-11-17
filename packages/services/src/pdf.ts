import { generatedFiles, jobDescriptions, resumes, resumeTemplates, resumeVersions, type Database } from "@resume-pilot/database";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import { and, eq, isNull } from "drizzle-orm";
import { resumeContentHash } from "./structuring";

/**
 * PDF export — prd.md §10.3. Free, no AI.
 *
 * The worker renders the version's template HTML in headless Chromium and
 * stores the PDF in ImageKit. `generated_files` caches it by
 * (version, content hash, template): re-exporting an unchanged version
 * reuses the stored file. A hand edit changes the hash and a template
 * switch changes the template, so either one renders a fresh PDF.
 */

export const DEFAULT_TEMPLATE_KEY = "classic";

export class PdfExportError extends Error {
  constructor(
    readonly code: "not_found",
    message: string,
  ) {
    super(message);
    this.name = "PdfExportError";
  }
}

export interface PdfTarget {
  versionId: string;
  userId: string;
  templateId: string;
  templateKey: string;
  contentHash: string;
  content: Resume;
  fileName: string;
}

/** Keeps letters (any script), digits and dashes, so the name is safe in a Content-Disposition header. */
const part = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** `Firstname-Lastname-<JobTitle>.pdf` (§10.3); "resume.pdf" when all three are empty. */
export function pdfFileName(resume: Pick<Resume, "personalInfo">, jobTitle: string | null | undefined): string {
  const name = [resume.personalInfo.firstName, resume.personalInfo.lastName, jobTitle].map(part).filter(Boolean).join("-");
  return `${name.slice(0, 120) || "resume"}.pdf`;
}

/** BullMQ job id for one render: same version + template + content → same job. */
export function pdfJobId(t: Pick<PdfTarget, "versionId" | "templateId" | "contentHash">): string {
  return `pdf-${t.versionId}-${t.templateId}-${t.contentHash.slice(0, 24)}`;
}

/**
 * What an export of this version would produce right now. `userId`
 * scopes the lookup (multi-tenancy); the worker passes none and looks up
 * by version id alone, then uses the owner from the row.
 */
export async function resolvePdfTarget(db: Database, input: { versionId: string; userId?: string; templateId?: string }): Promise<PdfTarget> {
  const [row] = await db
    .select({
      versionId: resumeVersions.id,
      userId: resumes.userId,
      content: resumeVersions.content,
      templateId: resumeVersions.templateId,
      jobTitle: jobDescriptions.jobTitle,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .leftJoin(jobDescriptions, eq(jobDescriptions.id, resumeVersions.jdId))
    .where(and(eq(resumeVersions.id, input.versionId), isNull(resumeVersions.deletedAt), input.userId ? eq(resumes.userId, input.userId) : undefined));
  if (!row) throw new PdfExportError("not_found", "Version not found");

  // No choice saved yet = the default template, same as the preview.
  const templateId = input.templateId ?? row.templateId;
  const [template] = await db
    .select({ id: resumeTemplates.id, key: resumeTemplates.key })
    .from(resumeTemplates)
    .where(templateId ? eq(resumeTemplates.id, templateId) : eq(resumeTemplates.key, DEFAULT_TEMPLATE_KEY));
  if (!template) throw new PdfExportError("not_found", "Template not found");

  const content = resumeSchema.parse(row.content);
  return {
    versionId: row.versionId,
    userId: row.userId,
    templateId: template.id,
    templateKey: template.key,
    // Recomputed rather than read from the column, so the cache key always matches what gets rendered.
    contentHash: resumeContentHash(content),
    content,
    fileName: pdfFileName(content, row.jobTitle),
  };
}

async function findCached(db: Pick<Database, "select">, t: Pick<PdfTarget, "versionId" | "templateId" | "contentHash">) {
  const [hit] = await db
    .select({ storageKey: generatedFiles.storageKey })
    .from(generatedFiles)
    .where(and(eq(generatedFiles.versionId, t.versionId), eq(generatedFiles.templateId, t.templateId), eq(generatedFiles.contentHash, t.contentHash)));
  return hit ?? null;
}

export interface PdfJobPayload {
  versionId: string;
  templateId: string;
  contentHash: string;
}

export type PdfExportStatus =
  | { status: "ready"; url: string; fileName: string }
  | { status: "pending"; fileName: string }
  | { status: "failed"; fileName: string; error: string };

export interface PdfRequestDeps {
  /** 5-minute signed URL for one of the user's files (packages/storage). */
  signUrl: (input: { userId: string; storageKey: string }) => string;
  enqueue: (job: PdfJobPayload, jobId: string) => Promise<unknown>;
}

/** Download button: the cached PDF straight away, or a render job to poll with getPdfExportStatus. */
export async function requestPdfExport(db: Database, input: { userId: string; versionId: string }, deps: PdfRequestDeps): Promise<PdfExportStatus> {
  const t = await resolvePdfTarget(db, input);
  const hit = await findCached(db, t);
  if (hit) return { status: "ready", url: deps.signUrl({ userId: t.userId, storageKey: hit.storageKey }), fileName: t.fileName };
  await deps.enqueue({ versionId: t.versionId, templateId: t.templateId, contentHash: t.contentHash }, pdfJobId(t));
  return { status: "pending", fileName: t.fileName };
}

export const PDF_FAILED_MESSAGE = "We couldn't create the PDF. Please try again.";

/** Polled while a render runs. `jobFailed` asks the queue about this exact render. */
export async function getPdfExportStatus(
  db: Database,
  input: { userId: string; versionId: string },
  deps: Pick<PdfRequestDeps, "signUrl"> & { jobFailed: (jobId: string) => Promise<boolean> },
): Promise<PdfExportStatus> {
  const t = await resolvePdfTarget(db, input);
  const hit = await findCached(db, t);
  if (hit) return { status: "ready", url: deps.signUrl({ userId: t.userId, storageKey: hit.storageKey }), fileName: t.fileName };
  if (await deps.jobFailed(pdfJobId(t))) return { status: "failed", fileName: t.fileName, error: PDF_FAILED_MESSAGE };
  return { status: "pending", fileName: t.fileName };
}

export interface PdfProcessDeps {
  render: (content: Resume, templateKey: string, title: string) => Promise<Uint8Array>;
  upload: (input: { userId: string; data: Uint8Array }) => Promise<{ storageKey: string; storageFileId: string }>;
  deleteFile: (storageFileId: string) => Promise<void>;
}

export type ProcessPdfResult = { status: "rendered" | "cached" | "skipped"; storageKey?: string };

/**
 * Worker side. Renders whatever the version holds *now* (an edit made
 * after the click is cached under its own hash, which is what the next
 * status poll looks for). Two concurrent renders of the same content
 * both upload; the unique index keeps one row and the loser's file is
 * deleted, so storage never holds an unreferenced PDF.
 */
export async function processPdfExport(db: Database, job: PdfJobPayload, deps: PdfProcessDeps): Promise<ProcessPdfResult> {
  let t: PdfTarget;
  try {
    t = await resolvePdfTarget(db, { versionId: job.versionId, templateId: job.templateId });
  } catch (err) {
    if (err instanceof PdfExportError) return { status: "skipped" }; // deleted since the click
    throw err;
  }
  const hit = await findCached(db, t);
  if (hit) return { status: "cached", storageKey: hit.storageKey };

  const pdf = await deps.render(t.content, t.templateKey, t.fileName.replace(/\.pdf$/, ""));
  const stored = await deps.upload({ userId: t.userId, data: pdf });
  const inserted = await db
    .insert(generatedFiles)
    .values({ versionId: t.versionId, templateId: t.templateId, contentHash: t.contentHash, storageKey: stored.storageKey, storageFileId: stored.storageFileId })
    .onConflictDoNothing()
    .returning({ id: generatedFiles.id });
  if (inserted.length === 0) {
    await deps.deleteFile(stored.storageFileId).catch(() => undefined);
    const winner = await findCached(db, t);
    return { status: "cached", storageKey: winner?.storageKey };
  }
  return { status: "rendered", storageKey: stored.storageKey };
}
