# Wallet balance and ledger

**Milestone:** M2 · prd.md §3.5
**Status:** todo

## Scope

- `credit_accounts` (cached balance, one per user, `balance >= 0` check) kept in sync with `credit_ledger` in the same transaction as every ledger write
- Append-only `credit_ledger`: purchase, capture, refund, admin adjustment, coupon credit, referral credit — each with `balance_after`
- Wallet page data: balance, active holds, history (action, credits, balance after, date)

## Done when

- Ledger is never updated/deleted, only appended
- Cached balance always equals sum of ledger entries for that user (reconciliation query/test)
