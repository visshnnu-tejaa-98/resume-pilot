# Coupons and referral codes

**Milestone:** M2 · prd.md §2.1, §16.2.1, §16.2.20
**Status:** todo

## Scope

- `coupons`: admin-created, credits per code, optional max redemptions/expiry/active flag, case-insensitive unique code
- `referral_codes`: one auto-generated per user
- `code_redemptions`: atomic, unique per (user, code) — one code per account ever, not own code, EARLYBIRD xor referral
- Referral redemption grants both sides (referee 100, referrer 100) in one transaction, as linked `referral_credit` ledger entries
- Abuse checks: rate-limit code attempts (5/hour/user); flag many referrals from same IP/device for admin review — flagged referral still grants the referee, holds the referrer's credits until admin approval

## Done when

- EARLYBIRD and a referral code both work per acceptance criterion 16.2.1
- A flagged referral grants the referee immediately but the referrer only after admin approval (16.2.20)
