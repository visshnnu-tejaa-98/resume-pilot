# Admin: users, credits, coupons, pricing config

**Milestone:** M12 · prd.md §2.2
**Status:** todo

## Scope

- Manage users and suspension
- View wallets, credit ledger, holds, payments, refunds
- Grant/deduct credits manually — reason required, written to `audit_logs`
- Configure top-up packs, credit value, markup, minimum charge per action (`pricing_config`, `credit_packages`)
- Create/limit/disable coupon codes; view redemptions and referrals; approve flagged referrals
- Manage templates

## Done when

- Every manual credit adjustment requires a reason and is visible in the audit log (acceptance criterion 16.2.15)
