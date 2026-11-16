# Estimate → hold → capture

**Milestone:** M2 · prd.md §3.4, §16.2.3-5
**Status:** testing. All "done when" items are verified against local Postgres. No AI action calls these yet; M5/M6/M7 will.

## Scope

- Estimate: token-count input (resume JSON + JD length) + max output budget per action type
- Hold: atomic check of `balance − active holds`, create `credit_holds` row with idempotency key, reject with "Buy credits" if insufficient
- Capture: on AI success, capture actual amount (never more than estimate), release remainder, one `credit_ledger` debit
- Release: full release on failure/timeout/validation error
- Safety net: holds auto-expire after 15 minutes (scheduled job)
- All hold/capture/release wrapped in one DB transaction with `SELECT ... FOR UPDATE` on `credit_accounts`

## Done when

- Load test: 20 parallel requests on a limited balance never overspend the available balance (16.2.5): **done**. With 20 parallel holds of 150 on a 1,000 balance, exactly 6 succeed, 14 get `InsufficientCreditsError`, and 100 stays available. 20 parallel hold+capture flows never take the balance below 0, and the balance equals 1,000 minus the ledger sum.
- Charged credits never exceed the estimate shown to the user (16.2.4): **done**. Capture charges `min(actual, hold)`; a test overruns usage by about 1000× and is charged exactly the estimate. Failures charge 0.
- A retried request with the same idempotency key never double-charges: **done**. 5 concurrent holds with one key produce 1 job and 1 hold. 2 concurrent captures plus a later retry produce 1 ledger row.

## What was built

- **`pricing_config.action_settings`** (migration 0004): per action (`jd_analysis`, `generation`, `ats_scoring`), the model, the prompt overhead in tokens, and `maxOutputTokens`. It's versioned with the rest of pricing and admin-editable through `admin.pricing.createVersion`. Zod checks that every action's model has a price. The defaults are placeholders until the eval set (M13-01).
- **`@resume-pilot/credits`** `estimate.ts`: `estimateCredits(config, action, inputParts)`, which counts tokens with `gpt-tokenizer@4.1.0` (o200k) and adds overhead and the full output budget. **The AI call must pass `maxOutputTokens` as `max_output_tokens`** (enforce this in M5/M6/M7), so the output side can't exceed the estimate.
- **`@resume-pilot/services`** `credits.ts`. These live in services, not the credits package, because capture needs `getPricingConfigByVersion`, and services → credits is already a dependency, so the reverse would be a cycle. `credits` keeps the pure math.
  - `estimateAction(db, action, parts)` uses the active pricing config.
  - `placeHold(db, { userId, idempotencyKey, estimate })` locks the account `FOR UPDATE`, then checks the key, then checks available = balance − active unexpired holds. It creates `ai_jobs` (pending, with the estimate's pricing version) and `credit_holds` (15-minute expiry). The same key returns the existing hold; a key reused for another user or action throws `IdempotencyConflictError`.
  - `captureHold(db, { aiJobId, usage })` prices under the **job's recorded** pricing version, so a mid-job markup change can't raise the charge. It charges `min(actual, hold)`, writes one `capture` ledger row (`source_type = ai_job`), updates the cached balance in the same transaction, and marks the job succeeded with tokens and cost. A retry returns the original result. An expired hold is released and charges nothing.
  - `releaseHold(db, { aiJobId, reason })` releases in full and marks the job failed with 0 charged. It's idempotent and never releases a captured hold.
  - `expireStaleHolds(db)` sweeps holds past 15 minutes, per hold under the account lock so it can't race a capture. Expired holds already stop counting against available balance before the sweep runs.
  - `getWalletBalance`: balance, held, available. `wallet` (tRPC) now returns all three.
  - Lock order is always account, then hold, so there are no deadlocks between hold, capture, release and expiry.
- **Worker**: a `maintenance` queue; `expire-holds` runs every minute via `upsertJobScheduler`, which is idempotent across restarts and replicas.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks. New tests: 15 credit tests against real Postgres (above), plus queue and worker scheduler tests.
- A test caught a real bug: capture released an expired hold and then threw, which rolled back the release. Fixed by committing the release first and raising afterwards.
- The local worker registered the `expire-holds` schedule (checked in Redis).

## Left for later

- tRPC procedures for estimate/confirm come with the first paid action (M5 JD analysis), along with the "Buy credits" UI on `InsufficientCreditsError`.
- Grants (purchase, coupon, referral, admin adjustment) are M2-03/M2-04/M10. Tests set balances directly until then.
