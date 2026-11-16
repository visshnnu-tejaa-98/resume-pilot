# Pricing config

**Milestone:** M2 · prd.md §3.3, §3.6, §16.4
**Status:** testing (all "done when" items verified against local Postgres; no admin UI yet, that's M12)

## Scope

- `pricing_config` table: model prices, USD→INR FX rate, markup multiplier, minimum charge per action. Versioned, and every charge records which version it used
- Credit calculation function: `credits = ceil((AI cost in INR × markup) / credit value)`
- Admin-editable (no deploy needed to change markup/minimums)

## Done when

- Changing markup in `pricing_config` affects new charges without a code deploy: **done**. `getActivePricingConfig` reads the DB fresh on every call (no in-process cache), and a test creates markup 3 → 4 versions and sees 150 → 200 credits for the same usage.
- Every row in `ai_jobs` records the `pricing_config` version used: **done**. `ai_jobs.pricing_config_version` is now `NOT NULL` with an FK to `pricing_config.version`. A test confirms the DB rejects both a missing version and a non-existent one.

## What was built

- **Migration `0001`** (`packages/database/drizzle/`):
  - `pricing_config` gets `credit_value_inr` (default 0.0500 = ₹500/10,000), `created_by_user_id` (FK users) and `note`.
  - Partial unique index `pricing_config_single_active_key`, so at most one active row exists.
  - Check constraints: FX rate, markup and credit value > 0; minimum ≥ 0.
  - `ai_jobs.pricing_config_version` is NOT NULL and references `pricing_config.version`.
- **`@resume-pilot/validators`** `pricing.ts`: Zod schemas for model prices (input/output/optional cached-input USD per 1M tokens), config input, and `createPricingConfigVersionInputSchema` (config plus a required admin reason).
- **`@resume-pilot/credits`** `pricing.ts`: pure functions `aiCostInr`, `creditsForCostInr`, `calculateCredits` and `UnknownModelError`. The config is passed in and never read inside these functions, so the estimate and the capture use the same formula and the same version.
  - Float-noise guard: the value is snapped to 6 dp before `ceil`, so exact results like 60 don't round up to 61.
  - Cached-input tokens are priced separately and fall back to the input price.
  - The minimum charge is applied per action.
- **`@resume-pilot/services`** `pricing.ts`: `getActivePricingConfig`, `getPricingConfigByVersion` (for re-pricing a capture under its estimate's version), `listPricingConfigs`, and `createPricingConfigVersion`.
  - Creating a version is append-only: one transaction inserts N+1, deactivates N and writes an `audit_logs` row with the reason.
  - A `pg_advisory_xact_lock` serialises concurrent admins.
  - JSONB model prices are re-validated with Zod on read.
- **`@resume-pilot/trpc`**: `admin.pricing.active`, `admin.pricing.list` and `admin.pricing.createVersion`, all on `adminProcedure`.
- **Seed**: v1 now sets `credit_value_inr` and a note.

## Verified

- `pnpm turbo lint build test` with `DATABASE_URL` set: 39/39 tasks pass. Re-ran the tests with `--force` and they pass again, which rules out stale-data false positives.
- New tests:
  - credits: 16 unit tests (formula, cached pricing, minimum, float noise, markup/credit-value changes, invalid usage, unknown model, estimate ≥ actual)
  - services: 6 tests against real Postgres (version bump + audit, markup change → new charge, old version unchanged, 3 concurrent creates → distinct versions with one active, ai_jobs NOT NULL/FK, DB-level single-active + markup check)
  - trpc: 4 tests (unauthenticated → UNAUTHORIZED, user → FORBIDDEN on all 3 procedures, admin reads, invalid input writes nothing)
- The services suite removes the versions it created and re-activates the original, so the local DB still has only v1 active after the run.

## Left for later

- Admin UI for editing pricing belongs to `todo/m12-dashboards-admin/02`.
- Real model prices, FX rate and markup depend on the eval set (`todo/m13-testing-deploy/01`). The seed values are placeholders.
- Writing `ai_jobs` rows with the version, and re-pricing at capture, happen in `todo/m2-credits/02-estimate-hold-capture.md`, which consumes these functions.
