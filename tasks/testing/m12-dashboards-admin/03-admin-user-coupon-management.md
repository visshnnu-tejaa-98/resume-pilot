# Admin: users, credits, coupons, pricing config

**Milestone:** M12 · prd.md §2.2
**Status:** testing

## Scope

- Manage users and suspension
- View wallets, credit ledger, holds, payments, refunds
- Grant/deduct credits manually — reason required, written to `audit_logs`
- Configure top-up packs, credit value, markup, minimum charge per action (`pricing_config`, `credit_packages`)
- Create/limit/disable coupon codes; view redemptions and referrals; approve flagged referrals
- Manage templates

## Done when

- Every manual credit adjustment requires a reason and is visible in the audit log (acceptance criterion 16.2.15)

## Status check (m12)

Already in place from earlier milestones:

- Users and suspension; audited credit adjust with a required reason (`adminAdjustCredits`).
- Coupons and flagged-referral review.
- Pricing config versions; packs (m10); templates; ledger; payments and refunds (m10).

Added here: the user page now shows payments and refunds (see 02).

## How to test

- Admin → user → Adjust credits without a reason is blocked. With a reason, the entry appears in Audit log and the ledger.
