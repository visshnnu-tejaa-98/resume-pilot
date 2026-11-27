# Load and security tests

**Milestone:** M13 · prd.md §15, §16.2.5, §16.2.14
**Status:** testing — all items automated; CI workflow added but not yet run on GitHub

## Scope

- Load test: 20 parallel requests against a limited balance never overspend (acceptance criterion 16.2.5)
- Security: server-side auth on every tRPC procedure, magic-byte checks, ImageKit signed-URL expiry and private files (unsigned URL doesn't resolve), ImageKit private key never in client bundles, secrets in env only, Razorpay/Clerk webhook signature verification
- Cross-tenant isolation test: user A cannot read user B's resumes, files, JDs, reports or ledger (acceptance criterion 16.2.14)
- Rate limit tests: 10 AI actions/min/user, 20 uploads/day/user, per-IP limits on public endpoints

## Done when

- All items above have an automated test (Vitest/Playwright) in CI, not just manual verification

## Progress

Run everything locally against a dedicated DB: `pnpm test:db` (creates `resume_pilot_test`, migrates, seeds, runs all suites; refuses a DB without "test" in its name). CI: [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) — Postgres + Redis services, lint, build, all tests.

| Scope item | Test |
|---|---|
| 20 parallel requests never overspend | `packages/services/src/credits.test.ts` (existing: parallel holds, hold+capture) |
| Server-side auth on **every** tRPC procedure | `packages/trpc/src/security.test.ts` — walks the whole router: every non-public procedure → UNAUTHORIZED anonymously; every `admin.*` → FORBIDDEN for a user; role read per request |
| Magic-byte checks | `packages/file-processing/src/validate*.test.ts` |
| ImageKit signed-URL expiry, private files, ownership | `packages/storage/src/index.test.ts` (existing) |
| Private key / secrets never in client bundles, env only | `apps/web/src/security/secrets.test.ts` — client components can't read server env vars or import server packages; no `NEXT_PUBLIC_*SECRET`; no committed secrets or tracked `.env`; built `.next/static` scanned for secret values |
| Razorpay / Clerk webhook signatures | `apps/web/app/api/webhooks/*/route.test.ts` (existing) |
| Cross-tenant isolation (16.2.14) | `packages/trpc/src/isolation.test.ts` — user B with user A's real ids on resumes, files, versions (incl. save/delete/PDF), JDs, generation, scoring, compare, reports, wallet |
| 10 AI actions/min/user | **New**: `AI_ACTIONS_PER_MINUTE` enforced in `placeHold` under the account lock (+ `ai_jobs (user_id, created_at)` index, migration 0014) → `TOO_MANY_REQUESTS`. Test: `packages/services/src/ai-rate-limit.test.ts` |
| 20 uploads/day/user | `packages/services/src/uploads.test.ts` (existing) |
| Per-IP limits on public endpoints | **New**: `apps/web/src/server/rate-limit.ts` (Redis fixed window, in-memory fallback) on anonymous tRPC (60/min) and unsubscribe (30/min). Test: `rate-limit.test.ts`. Webhooks excluded (signature-authenticated, providers retry from shared IPs). |

### Left
- First green run of the CI workflow on GitHub.
