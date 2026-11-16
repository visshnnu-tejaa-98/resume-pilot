# Wallet balance and ledger

**Milestone:** M2 · prd.md §3.5
**Status:** testing. Both "done when" items are verified against local Postgres. The wallet page UI itself is M12-01; the data and API are done.

## Scope

- `credit_accounts` (cached balance, one per user, `balance >= 0` check) kept in sync with `credit_ledger` in the same transaction as every ledger write
- Append-only `credit_ledger`: purchase, capture, refund, admin adjustment, coupon credit, referral credit — each with `balance_after`
- Wallet page data: balance, active holds, history (action, credits, balance after, date)

## Done when

- Ledger is never updated/deleted, only appended: **done**, enforced by the database. A trigger (migration 0005) rejects UPDATE, DELETE and TRUNCATE on `credit_ledger`, and a test confirms all three fail. The only exception is the cascade from deleting a user, so account deletion (DPDP) still works; that's tested too.
- Cached balance always equals the sum of ledger entries for that user: **done**. `findWalletMismatches` checks the cached balance against the ledger sum and the newest `balance_after`. A test runs grants, 5 hold/capture/release flows and an admin removal, then reconciles to zero mismatches. A drift test proves it detects a bypassed write. The worker runs it hourly and logs any hit as an error. The whole local DB reconciles to 0 after a full test run.

## What was built

All in `packages/services/src/ledger.ts`:

- `postLedgerEntry(tx, …)` is **the only writer** of `credit_ledger` and `credit_accounts.balance`. It locks the account `FOR UPDATE`, appends one row with `balance_after`, and updates the cached balance in the same transaction.
  - Idempotent on `(source_type, source_id)`: re-posting returns the original entry, and posting the same source with different values throws.
  - Enforces direction per type: purchase/coupon/referral must add credits, capture/refund must remove them, admin adjustments can do either.
  - Rejects zero or fractional amounts, and any entry that would take the balance below 0 (`NegativeBalanceError`).
- `captureHold` (M2-02) now writes through `postLedgerEntry`, so captures and grants share one code path.
- `grantCredits(db, …)`: entry point for purchases (M10), coupons and referrals (M2-04), which pass their own row id as the source.
- `adminAdjustCredits(db, { adminUserId, userId, credits, reason })`: writes the `audit_logs` row and the ledger entry in one transaction, with the audit row's id as the ledger source. A refused removal writes neither. The admin UI for this is M12-03.
- `findWalletMismatches(db, userIds?)`: the reconciliation query.
- `getWalletPage(db, userId, { limit, cursor })`: balance, held, available, active holds with their action and expiry, and history newest first (type, the AI action for captures, credits, balance after, note, date).
  - Keyset pagination on `(created_at, id)`. The cursor is an entry id compared in SQL, so microsecond timestamps never lose precision through JS `Date`.
  - A cursor from another user's ledger matches nothing.
- **tRPC `walletHistory`** (authProcedure): always the caller's own wallet. Input `{ limit ≤ 100, cursor: uuid }` is validated in `packages/validators/src/wallet.ts`. `wallet` now also returns `held` and `available`.
- **Worker**: a `reconcile-wallets` maintenance job runs hourly.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks. New tests: 15 ledger tests and 2 tRPC tests.
- Found and fixed: the M1 schema test inserted raw ledger rows and never deleted its user, leaving 25 inconsistent `vitest@example.com` wallets in the local DB. The test now deletes its user, and the 25 leftovers were removed.

## Left for later

- Wallet page UI: M12-01 (user dashboard).
- Refund entries are posted by M10-03. `refund` is a debit, because it reverses purchased credits when the money is returned.
