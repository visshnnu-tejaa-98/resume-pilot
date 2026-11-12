# S3 storage wrapper

**Milestone:** M3 · prd.md §5.2
**Status:** todo

## Scope

`packages/storage`:

- Private bucket, Block Public Access on, SSE, per-user prefixes (`users/<userId>/uploads/`, `users/<userId>/pdfs/`)
- Server-side upload only (browser never gets write access); browser sends file to API, API validates then uploads
- Short-lived (5 min) presigned GET URLs, generated after an ownership check
- Lifecycle rule: delete `uploads/` after 30 days; extracted JSON kept until user deletes
- IAM roles for web/worker, no stored access keys

## Done when

- A presigned URL for another user's file is never issuable (ownership check enforced server-side)
- Upload lifecycle deletion verified against a test bucket
