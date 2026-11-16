import { randomUUID } from "node:crypto";
import { NotFoundError } from "@imagekit/nodejs";
import { describe, expect, it, vi } from "vitest";
import {
  createImageKitStorage,
  imageKitConfigFromEnv,
  isOwnedBy,
  StorageError,
  userFolder,
  type ImageKitClient,
} from "./index";

const config = { privateKey: "private_test", urlEndpoint: "https://ik.imagekit.io/acme" };
const userId = randomUUID();
const otherId = randomUUID();

function fakeClient(
  overrides: Partial<{ upload: unknown; delete: unknown; buildSrc: unknown }> = {},
) {
  const upload = vi.fn(async (body: { folder: string; fileName: string }) => ({
    fileId: "file_123",
    filePath: `${body.folder}/${body.fileName}`,
  }));
  const del = vi.fn(async () => undefined);
  const buildSrc = vi.fn(
    (opts: { src: string }) => `https://ik.imagekit.io/acme${opts.src}?ik-s=sig`,
  );
  const client = {
    files: { upload: overrides.upload ?? upload, delete: overrides.delete ?? del },
    helper: { buildSrc: overrides.buildSrc ?? buildSrc },
  } as unknown as ImageKitClient;
  return { client, upload, del, buildSrc };
}

describe("paths and ownership", () => {
  it("puts each kind in the user's own folder", () => {
    expect(userFolder(userId, "upload")).toBe(`/users/${userId}/uploads`);
    expect(userFolder(userId, "pdf")).toBe(`/users/${userId}/pdfs`);
    expect(() => userFolder("../../etc", "upload")).toThrow(StorageError);
  });

  it("isOwnedBy accepts only a file directly in the user's folder", () => {
    const file = `${randomUUID()}.pdf`;
    expect(isOwnedBy(`/users/${userId}/uploads/${file}`, userId)).toBe(true);
    expect(isOwnedBy(`/users/${userId}/pdfs/${file}`, userId)).toBe(true);
    expect(isOwnedBy(`/users/${otherId}/uploads/${file}`, userId)).toBe(false);
    expect(isOwnedBy(`/users/${userId}/uploads/../../${otherId}/uploads/${file}`, userId)).toBe(
      false,
    );
    expect(isOwnedBy(`/users/${userId}/secrets/${file}`, userId)).toBe(false);
    expect(isOwnedBy(`/users/${userId}/uploads/resume.pdf`, userId)).toBe(false);
    expect(isOwnedBy(`/users/${userId}/uploads/${file}`, "not-a-uuid")).toBe(false);
  });
});

describe("createImageKitStorage", () => {
  it("uploads privately, under a random name in the user's folder, and returns key + file id", async () => {
    const { client, upload } = fakeClient();
    const storage = createImageKitStorage(config, client);

    const stored = await storage.uploadFile({
      userId,
      kind: "upload",
      data: Buffer.from("%PDF-1.4"),
      extension: "PDF",
    });

    expect(stored.storageFileId).toBe("file_123");
    expect(stored.storageKey).toMatch(new RegExp(`^/users/${userId}/uploads/[0-9a-f-]{36}\\.pdf$`));
    expect(isOwnedBy(stored.storageKey, userId)).toBe(true);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: `/users/${userId}/uploads`,
        isPrivateFile: true,
        useUniqueFileName: false,
        overwriteFile: false,
      }),
    );
  });

  it("rejects suspicious extensions", async () => {
    const storage = createImageKitStorage(config, fakeClient().client);
    for (const extension of ["", "p/df", "../x", "toolongext"]) {
      await expect(
        storage.uploadFile({ userId, kind: "upload", data: Buffer.from("x"), extension }),
      ).rejects.toBeInstanceOf(StorageError);
    }
  });

  it("signs a 5-minute URL for the user's own file", () => {
    const { client, buildSrc } = fakeClient();
    const storage = createImageKitStorage(config, client);
    const key = `/users/${userId}/pdfs/${randomUUID()}.pdf`;

    expect(storage.getSignedUrl({ userId, storageKey: key })).toContain("ik-s=");
    expect(buildSrc).toHaveBeenCalledWith({
      src: key,
      urlEndpoint: config.urlEndpoint,
      signed: true,
      expiresIn: 300,
    });
  });

  it("never signs a URL for another user's file", () => {
    const { client, buildSrc } = fakeClient();
    const storage = createImageKitStorage(config, client);
    const key = `/users/${otherId}/uploads/${randomUUID()}.pdf`;

    expect(() => storage.getSignedUrl({ userId, storageKey: key })).toThrow(StorageError);
    expect(buildSrc).not.toHaveBeenCalled();
  });

  it("caps signed URL expiry at an hour", () => {
    const storage = createImageKitStorage(config, fakeClient().client);
    const key = `/users/${userId}/pdfs/${randomUUID()}.pdf`;
    expect(() => storage.getSignedUrl({ userId, storageKey: key, expiresInSeconds: 0 })).toThrow();
    expect(() =>
      storage.getSignedUrl({ userId, storageKey: key, expiresInSeconds: 7200 }),
    ).toThrow();
  });

  it("delete is idempotent: a file that's already gone is fine, other errors surface", async () => {
    const gone = createImageKitStorage(
      config,
      fakeClient({
        delete: vi.fn(async () => {
          throw new NotFoundError(404, { message: "not found" }, "not found", new Headers());
        }),
      }).client,
    );
    await expect(gone.deleteFile("file_x")).resolves.toBeUndefined();

    const broken = createImageKitStorage(
      config,
      fakeClient({ delete: vi.fn(async () => Promise.reject(new Error("ECONNRESET"))) }).client,
    );
    await expect(broken.deleteFile("file_x")).rejects.toThrow("ECONNRESET");
  });
});

describe("imageKitConfigFromEnv", () => {
  it("requires the private key and URL endpoint, and trims a trailing slash", () => {
    expect(() => imageKitConfigFromEnv({})).toThrow(/not configured/);
    expect(
      imageKitConfigFromEnv({
        IMAGEKIT_PRIVATE_KEY: "k",
        IMAGEKIT_URL_ENDPOINT: "https://ik.io/x/",
      }),
    ).toEqual({ privateKey: "k", urlEndpoint: "https://ik.io/x" });
  });
});
