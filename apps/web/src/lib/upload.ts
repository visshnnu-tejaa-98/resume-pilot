/**
 * Client-side mirror of the upload limits in
 * packages/file-processing/src/validate.ts. That package pulls in
 * server-only deps (pdfjs, tesseract), so it can't be imported here.
 * These checks only give fast feedback; POST /api/uploads re-validates
 * everything (magic bytes, size, pages) and is the real gate.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PAGES = 5;

const DOC_EXT = [".pdf", ".docx", ".tex"];
const IMAGE_EXT = [".png", ".jpg", ".jpeg"];
export const UPLOAD_ACCEPT = [...DOC_EXT, ...IMAGE_EXT].join(",");

const ext = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

/** Returns a user-facing problem with the selection, or null if it looks fine. */
export function checkUploadSelection(files: File[]): string | null {
  if (files.length === 0) return "Choose a file to upload.";
  const unsupported = files.find((f) => !DOC_EXT.includes(ext(f.name)) && !IMAGE_EXT.includes(ext(f.name)));
  if (unsupported) return `${unsupported.name} isn't a supported format. Use PDF, DOCX, LaTeX (.tex), PNG or JPG.`;
  const docs = files.filter((f) => DOC_EXT.includes(ext(f.name)));
  if (docs.length > 0 && files.length > 1) return "Upload one document, or up to 5 images as pages.";
  if (files.length > MAX_IMAGE_PAGES) return "Upload up to 5 images as pages of one resume.";
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) return "Files must be 10 MB or smaller in total.";
  return null;
}

export interface UploadResult {
  resumeId: string;
  status: "uploaded" | "failed";
}

/** POSTs the files to /api/uploads. Throws an Error with the server's message on failure. */
export async function uploadResume(files: File[]): Promise<UploadResult> {
  const body = new FormData();
  for (const f of files) body.append("files", f);
  const res = await fetch("/api/uploads", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok || !data.resumeId) throw new Error(data.error ?? "Upload failed. Please try again.");
  return { resumeId: data.resumeId, status: data.status ?? "uploaded" };
}
