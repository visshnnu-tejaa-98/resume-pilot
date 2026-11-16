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

/**
 * POSTs the files to /api/uploads. Uses XHR (not fetch) so callers get
 * byte-level upload progress (0–1). Abort with `signal`. Throws an Error
 * carrying the server's message on failure.
 */
export function uploadResume(
  files: File[],
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  const body = new FormData();
  for (const f of files) body.append("files", f);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as Partial<UploadResult> & { error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && data.resumeId) {
        resolve({ resumeId: data.resumeId, status: data.status ?? "uploaded" });
      } else {
        reject(new Error(data.error ?? "Upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
