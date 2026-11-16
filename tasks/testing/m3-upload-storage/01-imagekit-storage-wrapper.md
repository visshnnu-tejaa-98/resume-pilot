# ImageKit storage wrapper

**Milestone:** M3 · prd.md §5.2
**Status:** testing. All "done when" items are verified, including a live round trip against the real ImageKit account. Nothing uploads through it yet; the upload flow is M3-02/03.

## Scope

`packages/storage`, the only package that talks to ImageKit (official `@imagekit/nodejs` SDK, server-side only):

- `uploadFile`: private file, random name, per-user folder; returns `{ storageKey, storageFileId }`
- `getSignedUrl`: 5-minute expiry, only after an ownership check
- `deleteFile`: by `fileId`, idempotent
- Server-side upload only; no private key or upload token in the browser
- 30-day retention via a daily worker job (ImageKit has no lifecycle rules)

## Done when

- A signed URL for another user's file is never issuable: **done, enforced inside the wrapper**. `getSignedUrl({ userId, storageKey })` refuses any key that isn't a file directly in that user's own folder. `isOwnedBy` rejects other users, `..` traversal, other folders and non-random names. This is on top of the ownership check callers still do in tRPC (to be covered by M3-02's procedure tests).
- An unsigned URL to an uploaded private file does not resolve: **done, verified live**. A test file uploaded to the real account returned 200 with matching content via the signed URL and **403** via the plain URL. The file was then deleted (twice, to confirm the second delete is a no-op).
- The cleanup job deletes a 31-day-old upload and leaves a 29-day-old one alone: **done**. Tested against real Postgres with a mocked delete, along with: never deletes twice, one failure doesn't stop the batch and is retried next run, and rows whose file is already gone are skipped.

## What was built

- **`packages/storage/src/index.ts`** (`@imagekit/nodejs@7.13.0`, pinned; 7.14 and 7.15 were too new under the two-week rule):
  - `createImageKitStorage(config, client?)` returns `{ uploadFile, getSignedUrl, deleteFile }`. The client can be injected for tests.
  - `uploadFile({ userId, kind: "upload" | "pdf", data, extension })` uploads to `/users/<userId>/uploads|pdfs/<uuid>.<ext>` with `isPrivateFile: true`, `useUniqueFileName: false`, `overwriteFile: false` and a `category-<kind>` tag. The extension is validated and the user id must be a UUID, so no path injection is possible.
  - `getSignedUrl` defaults to 300 s and is capped at 1 hour.
  - `deleteFile` treats ImageKit's 404 as success; other errors surface.
  - `getStorage()` builds lazily from env (`IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`). Importing the package never needs the env.
- **`packages/services/src/uploads.ts`**: `cleanupExpiredUploads(db, deleteFile)` processes the `resume_files` of resumes older than 30 days that still have a `storage_file_id`, in batches of 500. It deletes the file, then clears the column. The resume row and its extracted JSON stay. (It originally used `resumes.storage_file_id`; M3-02 moved files to `resume_files` so multi-image uploads fit, and dropped that column.)
- **Worker**: a `cleanup-uploads` maintenance job runs daily. `IMAGEKIT_*` was added to `apps/worker/.env.example` and the local `.env.local`.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks. New tests: 9 storage unit tests (fake client), 4 cleanup tests against real Postgres, 1 worker test.
- Live check against the real ImageKit account as described above. The test file was deleted afterwards.
- The local worker registered all three maintenance schedules (`expire-holds`, `reconcile-wallets`, `cleanup-uploads`).

## Left for later

- The upload endpoint (validation, magic bytes, size, hash dedupe) and the tRPC procedure that signs URLs after checking resume ownership: M3-02/03.
- On Railway, the worker service needs `IMAGEKIT_PRIVATE_KEY` and `IMAGEKIT_URL_ENDPOINT` as well as the web service.
