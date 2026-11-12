# Monorepo scaffold

**Milestone:** M1
**Status:** testing

## Scope

Set up the Turborepo + pnpm monorepo matching the layout in CLAUDE.md / prd.md §14.2:

- `apps/web` — Next.js App Router + TypeScript, tRPC mounted at `/api/trpc`
- `apps/worker` — BullMQ processor skeleton (no real jobs yet)
- `packages/database`, `packages/trpc`, `packages/services`, `packages/validators`, `packages/ai`, `packages/credits`, `packages/file-processing`, `packages/storage`, `packages/resume-templates`, `packages/emails` — empty packages with `package.json` + `tsconfig.json`
- Root `turbo.json`, `pnpm-workspace.yaml`, shared `tsconfig.base.json`, ESLint/Prettier config

## Done when

- `pnpm install` and `pnpm turbo build` succeed from root with all packages wired via workspace references
- `apps/web` boots locally and `apps/worker` starts without erroring

## Implementation notes

- `apps/web` has one route (`/`) that calls `health`/`ping` on `@resume-pilot/trpc` via `@trpc/client`, and the tRPC package itself depends on `@resume-pilot/credits` + `@resume-pilot/validators` — proves workspace wiring end to end, not just empty packages.
- Pinned `typescript` to **6.0.3**, not the newer 7.0.x "Corsa" native compiler — `typescript-eslint@8.72.2` doesn't support TS 7 yet (hard error on `eslint`). Revisit once typescript-eslint ships support (tracked upstream: typescript-eslint#10940).
- `turbo.json`: packages that only type-check (`tsc --noEmit`) declare `"outputs": []`; only `@resume-pilot/web#build` declares real `.next/**` outputs — avoids spurious "no output files found" warnings.
- All internal relative imports in `packages/trpc` are extensionless (`./context`, not `./context.js`) — Next's Turbopack bundler doesn't do the TS-style `.js`→`.ts` remap that `tsc`/Vitest do under `moduleResolution: Bundler`.
- BullMQ queue names can't contain `:` — worker queue is `resume-pilot-jobs`, not `resume-pilot:jobs`.
- Added `.prettierignore` to exclude `design/`, `prd.md`, `claude.md`, `tasks/`, and `pnpm-lock.yaml` from formatting.

## Verified

- `pnpm install`, `pnpm turbo lint test build` (35/35 tasks) all pass clean from a fresh install.
- `apps/web`: `next dev` serves `/` (HTTP 200) and `/api/trpc/health` returns `{"status":"ok"}`; `next build` (Turbopack) succeeds.
- `apps/worker`: boots and logs `listening on queue "resume-pilot-jobs"` against a real Redis (tested via a throwaway Docker container); without Redis reachable it retries and logs errors instead of crashing (ioredis `error` listener attached, no unhandled exception).
