import { randomUUID } from "node:crypto";
import ImageKit, { NotFoundError, toFile } from "@imagekit/nodejs";

/**
 * File storage on ImageKit — prd.md §5.2. The only package that talks
 * to ImageKit, so swapping providers touches this file alone.
 *
 * - Files are private (`isPrivateFile`): unsigned URLs don't resolve.
 * - Uploads happen server-side with the private key; the browser never
 *   gets write access or upload tokens.
 * - Files live under `/users/<userId>/uploads|pdfs/` with random names,
 *   never the user's original file name.
 * - Reads are 5-minute signed URLs, and only for a path inside the
 *   requesting user's own folder (defence in depth on top of the
 *   caller's ownership check).
 */

export type StorageKind = "upload" | "pdf";

const FOLDER: Record<StorageKind, string> = { upload: "uploads", pdf: "pdfs" };
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION = /^[a-z0-9]{1,8}$/;

export interface UploadFileInput {
  userId: string;
  kind: StorageKind;
  data: Buffer | Uint8Array;
  /** Lower-case extension without the dot, e.g. "pdf". Validated; the name itself is random. */
  extension: string;
}

export interface StoredFile {
  /** Path in ImageKit, e.g. /users/<id>/uploads/<uuid>.pdf — stored as resumes.file_key / generated_files.storage_key. */
  storageKey: string;
  /** ImageKit fileId — needed to delete the file. */
  storageFileId: string;
}

export interface Storage {
  uploadFile(input: UploadFileInput): Promise<StoredFile>;
  /** Signed, expiring URL for one of `userId`'s own files. */
  getSignedUrl(input: { userId: string; storageKey: string; expiresInSeconds?: number }): string;
  /** Idempotent: deleting a file that's already gone succeeds. */
  deleteFile(storageFileId: string): Promise<void>;
  /** Downloads one of `userId`'s own files (via a 60-second signed URL). */
  readFile(input: { userId: string; storageKey: string }): Promise<Uint8Array>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export function userFolder(userId: string, kind: StorageKind): string {
  if (!UUID.test(userId)) throw new StorageError("Invalid user id");
  return `/users/${userId.toLowerCase()}/${FOLDER[kind]}`;
}

/**
 * True when `storageKey` is a file directly inside one of `userId`'s
 * folders. Rejects traversal (`..`), nested paths and other users.
 */
export function isOwnedBy(storageKey: string, userId: string): boolean {
  if (!UUID.test(userId)) return false;
  const match = /^\/users\/([0-9a-f-]{36})\/(uploads|pdfs)\/([0-9a-f-]{36}\.[a-z0-9]{1,8})$/.exec(
    storageKey,
  );
  return match !== null && match[1] === userId.toLowerCase();
}

export interface ImageKitConfig {
  privateKey: string;
  urlEndpoint: string;
}

export function imageKitConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ImageKitConfig {
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = env.IMAGEKIT_URL_ENDPOINT;
  if (!privateKey || !urlEndpoint) {
    throw new StorageError(
      "ImageKit is not configured — set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT",
    );
  }
  return { privateKey, urlEndpoint: urlEndpoint.replace(/\/+$/, "") };
}

/** The subset of the ImageKit SDK this wrapper uses — lets tests pass a fake. */
export interface ImageKitClient {
  files: Pick<ImageKit["files"], "upload" | "delete">;
  helper: Pick<ImageKit["helper"], "buildSrc">;
}

export function createImageKitStorage(
  config: ImageKitConfig,
  client: ImageKitClient = new ImageKit({ privateKey: config.privateKey }),
  fetchImpl: typeof fetch = fetch,
): Storage {
  const storage: Storage = {
    async uploadFile({ userId, kind, data, extension }) {
      const ext = extension.toLowerCase();
      if (!EXTENSION.test(ext)) throw new StorageError(`Invalid extension "${extension}"`);
      const folder = userFolder(userId, kind);
      const fileName = `${randomUUID()}.${ext}`;

      const res = await client.files.upload({
        file: await toFile(Buffer.from(data), fileName),
        fileName,
        folder,
        isPrivateFile: true,
        useUniqueFileName: false,
        overwriteFile: false,
        tags: [`category-${kind}`],
      });
      if (!res.fileId || !res.filePath)
        throw new StorageError("ImageKit upload returned no file id");
      return { storageKey: res.filePath, storageFileId: res.fileId };
    },

    getSignedUrl({ userId, storageKey, expiresInSeconds = SIGNED_URL_TTL_SECONDS }) {
      if (!isOwnedBy(storageKey, userId)) {
        throw new StorageError("Refusing to sign a URL for a file outside the user's folder");
      }
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > 3600) {
        throw new StorageError("Signed URL expiry must be 1–3600 seconds");
      }
      return client.helper.buildSrc({
        src: storageKey,
        urlEndpoint: config.urlEndpoint,
        signed: true,
        expiresIn: expiresInSeconds,
      });
    },

    async deleteFile(storageFileId) {
      try {
        await client.files.delete(storageFileId);
      } catch (err) {
        if (err instanceof NotFoundError) return;
        throw err;
      }
    },

    async readFile({ userId, storageKey }) {
      const url = storage.getSignedUrl({ userId, storageKey, expiresInSeconds: 60 });
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) throw new StorageError("File not found in storage");
      if (!res.ok) throw new Error(`Storage download failed: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
  return storage;
}

let defaultStorage: Storage | undefined;

/** Process-wide storage built from env on first use, so importing never requires ImageKit env vars. */
export function getStorage(): Storage {
  defaultStorage ??= createImageKitStorage(imageKitConfigFromEnv());
  return defaultStorage;
}
