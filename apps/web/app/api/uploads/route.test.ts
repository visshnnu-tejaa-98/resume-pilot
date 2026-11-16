import { randomUUID } from "node:crypto";
import { createDatabase, resumes, users, type Database } from "@resume-pilot/database";
import { makeExe, makePdf, makePng } from "@resume-pilot/file-processing/fixtures";
import { createUserFromClerkWebhook, getUserByClerkId } from "@resume-pilot/services";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const stored = vi.hoisted(() => new Map<string, string>());
const queueAdd = vi.hoisted(() => vi.fn());
vi.mock("@/server/queue", () => ({
  getExtractionQueue: () => ({ add: queueAdd, getJob: async () => undefined }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("@/server/ensure-user", () => ({
  ensureUserSynced: async (clerkUserId: string) => {
    const { getDb } = await import("@/server/db");
    const { getUserByClerkId: get } = await import("@resume-pilot/services");
    return get(getDb(), clerkUserId);
  },
}));
vi.mock("@resume-pilot/storage", () => ({
  getStorage: () => ({
    uploadFile: async ({ userId, extension }: { userId: string; extension: string }) => {
      const id = `file_${randomUUID()}`;
      const key = `/users/${userId}/uploads/${randomUUID()}.${extension}`;
      stored.set(id, key);
      return { storageKey: key, storageFileId: id };
    },
    deleteFile: async (id: string) => void stored.delete(id),
  }),
}));

const connectionString = process.env.DATABASE_URL;

function uploadRequest(files: { name: string; data: Uint8Array }[]) {
  const form = new FormData();
  for (const f of files) form.append("files", new File([Buffer.from(f.data)], f.name));
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}

describe.skipIf(!connectionString)("POST /api/uploads", () => {
  let db: Database;
  let clerkUserId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    db = createDatabase(connectionString ?? "");
    clerkUserId = `clerk_${randomUUID()}`;
    ({ userId } = await createUserFromClerkWebhook(db, {
      clerkUserId,
      email: "upload-route@example.com",
    }));
  });

  beforeEach(() => {
    session.userId = clerkUserId;
    stored.clear();
    queueAdd.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  });

  it("rejects an unauthenticated request", async () => {
    session.userId = null;
    const { POST } = await import("./route");
    const res = await POST(uploadRequest([{ name: "cv.pdf", data: makePdf(1) }]));
    expect(res.status).toBe(401);
  });

  it("accepts a valid PDF: 201, stored, resume row created", async () => {
    const { POST } = await import("./route");
    const res = await POST(uploadRequest([{ name: "My CV.pdf", data: makePdf(2) }]));
    const body = (await res.json()) as { resumeId: string; pageCount: number };

    expect(res.status).toBe(201);
    expect(body.pageCount).toBe(2);
    expect(body).toMatchObject({ status: "uploaded" });
    expect(queueAdd).toHaveBeenCalledWith(
      "extract",
      { resumeId: body.resumeId },
      expect.objectContaining({ jobId: `extract-${body.resumeId}` }),
    );
    expect(stored.size).toBe(1);
    const [row] = await db.select().from(resumes).where(eq(resumes.id, body.resumeId));
    expect(row).toMatchObject({ userId, status: "uploaded", fileName: "My CV.pdf" });
  });

  it("done-when: a renamed .exe is rejected with 400 and nothing is stored", async () => {
    const { POST } = await import("./route");
    const res = await POST(uploadRequest([{ name: "resume.pdf", data: makeExe() }]));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "content_mismatch" });
    expect(stored.size).toBe(0);
  });

  it("done-when: re-uploading the same file returns 409 with the existing resume", async () => {
    const { POST } = await import("./route");
    const data = makePng(77);
    const first = (await (await POST(uploadRequest([{ name: "a.png", data }]))).json()) as {
      resumeId: string;
    };

    const res = await POST(uploadRequest([{ name: "renamed.png", data }]));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      reason: "duplicate",
      existingResumeId: first.resumeId,
    });
  });

  it("rejects a declared body over the limit with 413 before reading it", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-length": String(50 * 1024 * 1024) },
      body: "x",
    });
    expect((await POST(req)).status).toBe(413);
  });

  it("rejects a non-multipart body and an empty form", async () => {
    const { POST } = await import("./route");
    const notForm = new Request("http://localhost/api/uploads", { method: "POST", body: "hello" });
    expect((await POST(notForm)).status).toBe(400);
    expect((await POST(uploadRequest([]))).status).toBe(400);
  });

  it("refuses suspended users", async () => {
    const { POST } = await import("./route");
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, userId));
    const res = await POST(uploadRequest([{ name: "cv.pdf", data: makePdf(1) }]));
    await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
    expect(res.status).toBe(403);
    expect(await getUserByClerkId(db, clerkUserId)).toMatchObject({ status: "active" });
  });

  it("if extraction can't be queued, the resume is marked failed so the user can retry", async () => {
    const { POST } = await import("./route");
    queueAdd.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(uploadRequest([{ name: "cv.pdf", data: makePdf(3) }]));
    const body = (await res.json()) as { resumeId: string; status: string };

    expect(res.status).toBe(201);
    expect(body.status).toBe("failed");
    const [row] = await db.select().from(resumes).where(eq(resumes.id, body.resumeId));
    expect(row).toMatchObject({
      status: "failed",
      extractionError: expect.stringMatching(/Retry/),
    });
  });
});
