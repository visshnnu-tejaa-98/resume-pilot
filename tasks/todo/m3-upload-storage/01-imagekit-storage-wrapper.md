# ImageKit storage wrapper

**Milestone:** M3 · prd.md §5.2
**Status:** todo

## Scope

`packages/storage`, the only package that talks to ImageKit (official `@imagekit/nodejs` SDK, server-side only):

- `uploadFile({ userId, kind: "upload" | "pdf", buffer, mimeType })`: uploads as a **private file** (`isPrivateFile: true`) to `/users/<userId>/uploads/` or `/users/<userId>/pdfs/`, under a random file name (never the user's original name). Returns `{ storageKey, storageFileId }`.
- `getSignedUrl(storageKey)`: signed URL with a 5-minute expiry. Callers must check ownership *before* calling it; the wrapper takes no client-supplied user id.
- `deleteFile(storageFileId)`: deletes by ImageKit `fileId`, and treats "already deleted" as success so retries are idempotent.
- Server-side upload only. The browser never gets the private key or client-side upload auth tokens; it sends the file to our API, which validates it and then uploads.
- 30-day retention: ImageKit has no lifecycle rules, so add a daily BullMQ repeatable job in `apps/worker` that finds `resumes` older than 30 days with a non-null `storage_file_id`, deletes each file, and clears the column. Extracted JSON is kept.
- Env: `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` (already in `apps/web/.env.example`). Fail clearly at first use if unset, like `packages/emails/src/send.ts` does.
- Schema is ready: `resumes.storage_file_id` and `generated_files.storage_key` + `storage_file_id` (migration `0002`).

## Done when

- A signed URL for another user's file is never issuable (ownership check enforced server-side, covered by a tRPC test)
- An unsigned URL to an uploaded private file does not resolve (verified against a real ImageKit test account)
- The cleanup job deletes a 31-day-old upload and leaves a 29-day-old one alone (unit test with a mocked wrapper, plus one manual run against the test account)
