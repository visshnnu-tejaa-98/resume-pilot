import { randomUUID } from "node:crypto";
import { RESUMES } from "@resume-pilot/ai/fixtures";
import { createDatabase, generatedFiles, resumes, resumeTemplates, resumeVersions, users, type Database } from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPdfExportStatus, pdfFileName, pdfJobId, processPdfExport, requestPdfExport, type PdfJobPayload, type PdfProcessDeps } from "./pdf";
import { resumeContentHash } from "./structuring";
import { createUserFromClerkWebhook } from "./user";
import { saveVersionContent, setVersionTemplate } from "./versions";

const SOURCE = RESUMES.frontend!;

describe("pdfFileName (§10.3)", () => {
  const r = (firstName: string, lastName: string) => ({ personalInfo: { ...SOURCE.personalInfo, firstName, lastName } });
  it("is Firstname-Lastname-JobTitle.pdf", () => {
    expect(pdfFileName(r("Asha", "Rao"), "Senior Frontend Engineer")).toBe("Asha-Rao-Senior-Frontend-Engineer.pdf");
  });
  it("drops missing parts and unsafe characters", () => {
    expect(pdfFileName(r("Asha", ""), null)).toBe("Asha.pdf");
    expect(pdfFileName(r("José", "O'Neil"), "C++ / .NET Dev")).toBe("José-O-Neil-C-NET-Dev.pdf");
    expect(pdfFileName(r("", ""), "  ")).toBe("resume.pdf");
    expect(pdfFileName(r("a\"b", "../x"), "y\r\nz")).toBe("a-b-x-y-z.pdf");
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("PDF export cache (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const sign = ({ storageKey }: { userId: string; storageKey: string }) => `signed:${storageKey}`;

  async function setup() {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `pdf-${randomUUID()}@example.com` });
    userIds.push(userId);
    const [resume] = await db.insert(resumes).values({ userId, fileKey: `k/${randomUUID()}`, fileName: "asha.pdf", fileFormat: "pdf", fileHash: randomUUID(), status: "ready" }).returning();
    const [original] = await db.insert(resumeVersions).values({ resumeId: resume!.id, kind: "original", content: SOURCE, contentHash: resumeContentHash(SOURCE), extractionMeta: {} }).returning();
    const [gen] = await db.insert(resumeVersions).values({ resumeId: resume!.id, kind: "generated", content: SOURCE, contentHash: resumeContentHash(SOURCE), parentVersionId: original!.id, generationMeta: {} }).returning();
    return { userId, versionId: gen!.id };
  }

  /** Fake worker deps: counts renders, "uploads" to memory. */
  function fakeWorker() {
    const deleted: string[] = [];
    const deps: PdfProcessDeps & { renders: string[]; deleted: string[] } = {
      renders: [],
      deleted,
      render: async (_content, templateKey) => {
        deps.renders.push(templateKey);
        return new TextEncoder().encode("%PDF-1.7 fake");
      },
      upload: async ({ userId }) => {
        const id = randomUUID();
        return { storageKey: `/users/${userId}/pdfs/${id}.pdf`, storageFileId: `file_${id}` };
      },
      deleteFile: async (id) => {
        deleted.push(id);
      },
    };
    return deps;
  }

  /** Request → (queue) → worker, like the real flow. */
  async function exportOnce(s: { userId: string; versionId: string }, worker = fakeWorker()) {
    const jobs: { job: PdfJobPayload; jobId: string }[] = [];
    const first = await requestPdfExport(db, s, { signUrl: sign, enqueue: async (job, jobId) => jobs.push({ job, jobId }) });
    for (const { job } of jobs) await processPdfExport(db, job, worker);
    const status = await getPdfExportStatus(db, s, { signUrl: sign, jobFailed: async () => false });
    return { first, status, jobs, worker };
  }

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it("first export renders with the default template, then reuses the stored file", async () => {
    const s = await setup();
    const a = await exportOnce(s);
    expect(a.first.status).toBe("pending");
    expect(a.worker.renders).toEqual(["classic"]);
    expect(a.status.status).toBe("ready");
    if (a.status.status !== "ready") return;
    expect(a.status.url).toMatch(new RegExp(`^signed:/users/${s.userId}/pdfs/`));

    const b = await exportOnce(s);
    expect(b.first).toEqual(a.status); // ready immediately, same file
    expect(b.jobs).toHaveLength(0);
    expect(b.worker.renders).toHaveLength(0);
    expect(await db.select().from(generatedFiles).where(eq(generatedFiles.versionId, s.versionId))).toHaveLength(1);
  });

  it("an edit or a template switch renders a new PDF", async () => {
    const s = await setup();
    await exportOnce(s);

    await saveVersionContent(db, { ...s, content: { ...SOURCE, summary: { ...SOURCE.summary, text: "Edited summary." } } });
    const edited = await exportOnce(s);
    expect(edited.first.status).toBe("pending");
    expect(edited.worker.renders).toEqual(["classic"]);

    await setVersionTemplate(db, { ...s, template: "modern" });
    const switched = await exportOnce(s);
    expect(switched.worker.renders).toEqual(["modern"]);
    expect(await db.select().from(generatedFiles).where(eq(generatedFiles.versionId, s.versionId))).toHaveLength(3);
  });

  it("job ids collapse repeat clicks for the same render", async () => {
    const s = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) await requestPdfExport(db, s, { signUrl: sign, enqueue: async (_j, id) => ids.push(id) });
    expect(new Set(ids).size).toBe(1);
    const [classic] = await db.select().from(resumeTemplates).where(eq(resumeTemplates.key, "classic"));
    expect(ids[0]).toBe(pdfJobId({ versionId: s.versionId, templateId: classic!.id, contentHash: resumeContentHash(SOURCE) }));
  });

  it("two concurrent renders keep one row and delete the duplicate upload", async () => {
    const s = await setup();
    let job: PdfJobPayload | undefined;
    await requestPdfExport(db, s, { signUrl: sign, enqueue: async (j) => (job = j) });
    const worker = fakeWorker();
    const results = await Promise.all([processPdfExport(db, job!, worker), processPdfExport(db, job!, worker)]);
    expect(results.map((r) => r.status).sort()).toEqual(["cached", "rendered"].sort());
    expect(await db.select().from(generatedFiles).where(eq(generatedFiles.versionId, s.versionId))).toHaveLength(1);
    // The loser may have seen the winner's row before rendering; if it rendered too, its upload is deleted.
    expect(worker.deleted).toHaveLength(worker.renders.length - 1);
  });

  it("reports a failed render, and never exports another user's version", async () => {
    const s = await setup();
    await requestPdfExport(db, s, { signUrl: sign, enqueue: async () => undefined });
    const failed = await getPdfExportStatus(db, s, { signUrl: sign, jobFailed: async () => true });
    expect(failed.status).toBe("failed");

    const other = await setup();
    await expect(requestPdfExport(db, { userId: other.userId, versionId: s.versionId }, { signUrl: sign, enqueue: async () => undefined })).rejects.toThrow("Version not found");
  });

  it("a version deleted before the job runs is skipped", async () => {
    const s = await setup();
    let job: PdfJobPayload | undefined;
    await requestPdfExport(db, s, { signUrl: sign, enqueue: async (j) => (job = j) });
    await db.update(resumeVersions).set({ deletedAt: new Date() }).where(eq(resumeVersions.id, s.versionId));
    const worker = fakeWorker();
    expect((await processPdfExport(db, job!, worker)).status).toBe("skipped");
    expect(worker.renders).toHaveLength(0);
  });
});
