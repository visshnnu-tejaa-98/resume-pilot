# Database schema (Drizzle)

**Milestone:** M1 / M2
**Status:** testing

## Scope

Implement the tables from prd.md §14.3 in `packages/database` using Drizzle ORM:

- All tables listed in the §14.3 table, with the key constraints specified (unique indexes, FKs, checks)
- UUID primary keys everywhere
- Migration tooling set up (`drizzle-kit`) and a seed script for local dev

## Done when

- `drizzle-kit generate` + `drizzle-kit migrate` produce a schema matching §14.3 against local Postgres — **done**, verified against a real Postgres 16 container (see below).
- `balance >= 0` check constraint on `credit_accounts` and unique `(source_type, source_id)` on `credit_ledger` are enforced at the DB level, not just app level — **done**, verified by actually trying to violate both (see below).

## What was built

`packages/database/src/schema/` — Drizzle schema for all 26 tables (the 25 listed in §14.3 plus `users`, which the table header text omits but the body requires), split by domain: `users`, `resumes` (+ `resume_versions`), `job-descriptions` (+ `jd_analyses`), `files` (`resume_templates` + `generated_files`), `ai` (`ai_jobs` + `ats_reports`), `pricing` (`pricing_config` + `credit_packages`), `credits` (`credit_accounts`, `credit_holds`, `credit_ledger`), `coupons` (+ `referral_codes`, `code_redemptions`), `payments` (+ `payment_events`), `audit`, `email` (6 tables). All PKs are `uuid().defaultRandom()`. Enums (`pgEnum`) for every closed-set status/type column instead of plain text, so Postgres itself rejects an invalid status.

- `packages/database/drizzle.config.ts` + `drizzle/` — generated migration (`0000_typical_thunderbolt.sql`), committed.
- `src/client.ts` — `createDatabase(connectionString)` factory returning a typed Drizzle instance, for `apps/web`/`apps/worker` to call once at startup.
- `src/migrate.ts` — runs pending migrations against `DATABASE_URL`.
- `src/seed.ts` — local-dev-only seed: 5 resume templates, the 2 settled credit packages (₹500→10,000 / ₹1,000→20,000+1,000 bonus, matching prd.md §2 exactly), `pricing_config` v1 with placeholder model prices, the `EARLYBIRD` coupon, email template settings, and 3 fake users with wallets via `@faker-js/faker`.

### Constraints beyond the two named in "Done when"

Every "Key constraints" cell in prd.md §14.3's table is implemented, not just the two the task called out:

- Case-insensitive uniqueness via functional indexes (`uniqueIndex(...).on(sql\`lower(${col})\`)`) on `coupons.code` and `referral_codes.code` — prd.md §2.1 says codes are case-insensitive, which an ordinary unique index on the raw column wouldn't enforce.
- A `check()` constraint on `job_descriptions.text` enforcing the 200–30,000 character range from §7.1 (after trimming, via `btrim`) — not just a client-side form check.
- `code_redemptions.user_id` is unique — the DB itself makes "one code per account, ever" (§2.1) impossible to violate, not just an application-level check.
- `resume_versions.parent_version_id` is a self-referential FK (nullable), matching the "FK parent_version_id" cell exactly.
- `ats_reports` has a composite index on `(version_id, content_hash, jd_id)` matching the cache-key shape from §9.1/§3.2.
- `payments.payment_id` is a nullable unique column — Postgres allows multiple NULLs through a unique index, which is exactly right here: a payment can sit in `created` status with no Razorpay payment id yet, and still won't collide once one arrives.

### A note on `resumeVersions`' self-reference

Drizzle has a known circular-type-inference problem when a table references its own not-yet-fully-typed `const` from inside its own column definition. Fixed with the documented pattern: `.references((): AnyPgColumn => resumeVersions.id)`, explicitly typing the callback's return as `AnyPgColumn` instead of letting TS try (and fail) to infer it.

## Verified (against a real Postgres 16, not just `drizzle-kit generate`)

- Spun up `postgres:16-alpine` in a throwaway Docker container, ran `drizzle-kit generate` then the migration — all 26 tables created.
- Re-ran `drizzle-kit generate` a second time: "No schema changes, nothing to migrate" — confirms the schema is stable, not drifting.
- Ran `src/seed.ts` against it and queried the result back out: 5 templates, both credit packages with the exact credit amounts from prd.md §2, the `EARLYBIRD` coupon, 3 seeded users.
- **Actually tried to violate both named constraints via raw `psql`, not just inspected `\d`:** inserting `balance = -100` into `credit_accounts` was rejected by `credit_accounts_balance_non_negative_check`; inserting a second `credit_ledger` row with a `(source_type, source_id)` pair that already existed was rejected by `credit_ledger_source_type_source_id_key`.
- `packages/database/src/schema.test.ts` — a real Vitest suite (not mocked) that connects to `DATABASE_URL` and tries to violate 5 different constraints (balance check, ledger dedup, JD length check, one-code-per-account, case-insensitive coupon codes), plus confirms a zero balance is allowed. `describe.skipIf(!connectionString)` so it skips cleanly in environments without a DB (e.g. this one, by default) rather than failing. 6/6 pass against the real container; re-ran twice to confirm no stale-data false negatives (fixed one real bug this way — see below).
- Repo-wide `pnpm turbo lint build` — 26/26. `pnpm turbo test` with `DATABASE_URL` set — 16/16 including the new database suite.

### Bugs caught by actually running the tests twice, not just once

- First test run passed, but assertions were matching on the wrong error property: Drizzle's postgres-js adapter wraps the real Postgres error in its own `DrizzleQueryError` (`message: "Failed query: ..."`), so `.rejects.toThrow(/constraint_name/)` against the outer message never matches. Fixed by asserting on `error.cause.constraint_name` instead (the real driver error).
- Second run (after fixing the above) still failed on 2 of 6 tests — not a code bug, but a test-hygiene one: fixed string IDs (`sourceId`, `coupon code`) collided with rows inserted by the *first* run against the same persistent container, since nothing resets it between invocations. Fixed by generating a fresh `randomUUID()` per run instead of hardcoding IDs. Re-ran the full suite twice in a row afterward to confirm it's now actually idempotent.

## Running it yourself

```bash
docker run -d --rm --name resume-pilot-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=resume_pilot postgres:16-alpine
cd packages/database
pnpm db:generate   # only if you changed the schema
pnpm db:migrate
pnpm db:seed
DATABASE_URL=postgres://postgres:postgres@localhost:5432/resume_pilot pnpm test
```
