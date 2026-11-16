import { auth } from "@clerk/nextjs/server";
import {
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  validateUpload,
} from "@resume-pilot/file-processing";
import { enqueueExtraction } from "@resume-pilot/queue";
import { createResumeFromUpload, failExtraction, UploadError } from "@resume-pilot/services";
import { getStorage } from "@resume-pilot/storage";
import { getDb } from "@/server/db";
import { ensureUserSynced } from "@/server/ensure-user";
import { getExtractionQueue } from "@/server/queue";

/**
 * POST /api/uploads — resume upload (prd.md §5.1–5.3). Multipart form
 * with one or more `files` fields: one .pdf/.docx/.tex, or up to 5
 * images as pages of one resume.
 *
 * The browser sends the file here; the server validates it (magic
 * bytes, size, pages, duplicate) and uploads to storage itself — the
 * browser never gets write access to storage (§5.2).
 */

// Multipart framing adds a little on top of the file bytes.
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 512 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return json(401, { error: "Sign in to upload." });

  const user = await ensureUserSynced(clerkUserId);
  if (user.status === "suspended") return json(403, { error: "This account is suspended." });

  // Reject obviously oversized requests before reading the body.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "Files must be 10 MB or smaller in total.", reason: "too_large" });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Send the file as multipart form data.", reason: "bad_request" });
  }
  const entries = form.getAll("files").filter((v): v is File => v instanceof File);
  if (entries.length > MAX_PAGES) {
    return json(400, {
      error: "Upload one document, or up to 5 images.",
      reason: "too_many_files",
    });
  }

  try {
    const upload = await validateUpload(
      await Promise.all(
        entries.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
      ),
    );
    const created = await createResumeFromUpload(getDb(), getStorage(), {
      userId: user.id,
      upload,
    });

    // Extraction runs in the worker (§5.3). If it can't be queued, fail the
    // resume so the user gets a Retry button rather than a stuck upload.
    try {
      await enqueueExtraction(getExtractionQueue(), { resumeId: created.resumeId });
    } catch (err) {
      console.error("[uploads] failed to enqueue extraction:", err);
      await failExtraction(getDb(), created.resumeId);
      return json(201, { ...created, status: "failed" });
    }
    return json(201, { ...created, status: "uploaded" });
  } catch (err) {
    if (err instanceof UploadValidationError)
      return json(400, { error: err.message, reason: err.reason });
    if (err instanceof UploadError) {
      return err.reason === "duplicate"
        ? json(409, {
            error: err.message,
            reason: "duplicate",
            existingResumeId: err.existingResumeId,
          })
        : json(429, { error: err.message, reason: err.reason });
    }
    console.error("[uploads] upload failed:", err);
    return json(500, { error: "Upload failed. Please try again." });
  }
}
