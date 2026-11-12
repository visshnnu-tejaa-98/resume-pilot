# Estimate → hold → capture

**Milestone:** M2 · prd.md §3.4, §16.2.3-5
**Status:** todo

## Scope

`packages/credits`:

- Estimate: token-count input (resume JSON + JD length) + max output budget per action type
- Hold: atomic check of `balance − active holds`, create `credit_holds` row with idempotency key, reject with "Buy credits" if insufficient
- Capture: on AI success, capture actual amount (never more than estimate), release remainder, one `credit_ledger` debit
- Release: full release on failure/timeout/validation error
- Safety net: holds auto-expire after 15 minutes (scheduled job)
- All hold/capture/release wrapped in one DB transaction with `SELECT ... FOR UPDATE` on `credit_accounts`

## Done when

- Load test: 20 parallel requests on a limited balance never overspend available balance (acceptance criterion 16.2.5)
- Charged credits never exceed the estimate shown to the user (16.2.4)
- A retried request with the same idempotency key never double-charges
