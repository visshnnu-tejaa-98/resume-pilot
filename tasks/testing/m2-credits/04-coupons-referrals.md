# Coupons and referral codes

**Milestone:** M2 · prd.md §2.1, §16.2.1, §16.2.20
**Status:** testing. Both acceptance criteria are verified against local Postgres. The admin and wallet UIs are M12.

## Scope

- `coupons`: admin-created, credits per code, optional max redemptions/expiry/active flag, case-insensitive unique code
- `referral_codes`: one auto-generated per user
- `code_redemptions`: atomic, unique per (user, code) — one code per account ever, not own code, EARLYBIRD xor referral
- Referral redemption grants both sides (referee 100, referrer 100) in one transaction, as linked `referral_credit` ledger entries
- Abuse checks: rate-limit code attempts (5/hour/user); flag many referrals from same IP/device for admin review — flagged referral still grants the referee, holds the referrer's credits until admin approval

## Done when

- EARLYBIRD and a referral code both work per 16.2.1: **done**.
  - A coupon grants its credits, case-insensitively, as a `coupon_credit` linked to the redemption.
  - A referral grants 100 + 100 as two `referral_credit` entries linked to the same redemption.
  - One code per account, in either order and under concurrency.
  - A user can't apply their own code.
- A flagged referral grants the referee immediately and the referrer only after admin approval (16.2.20): **done**. The referee is paid immediately and the referrer is `held`. Approve pays the referrer once; a second decision is refused. Reject never pays. Both are audited with a reason.

## What was built

- **Migration 0006**:
  - `code_attempts` table (every attempt, wrong codes included) for the rate limit.
  - On `code_redemptions`: `flag_reason`, `ip_hash`, `device_hash` (salted SHA-256, never the raw IP), `reviewed_by_user_id`, `reviewed_at`, plus indexes for the repeat lookups.
- **`packages/services/src/codes.ts`**:
  - `redeemCode(db, { userId, code, ip?, deviceId? })`:
    1. Checks the rate limit (5/hour) and records the attempt in its own commit, so failed guesses count.
    2. Resolves the code: coupons first, then referral codes, case-insensitively.
    3. Locks both wallets in user-id order, so two users redeeming each other's codes can't deadlock.
    4. Checks one-per-account (the unique index is the backstop for concurrent requests), own code, and the coupon's active flag, expiry and max redemptions (coupon row locked `FOR UPDATE`, so the count can't race).
    5. Posts through `postLedgerEntry`. The referee entry uses source `code_redemption`, the referrer entry `code_redemption_referrer`, both with the redemption id.
    - Errors are `CodeRedemptionError` with a reason and a user-facing message.
  - Flag rule: a referral is flagged if the same code was already redeemed from the same IP hash or device hash (`REFERRAL_FLAG_REPEATS = 1`).
  - `reviewFlaggedReferral` (approve/reject, audited) and `listFlaggedReferrals` (review queue).
  - Admin coupons: `createCoupon` (validated format, case-insensitive uniqueness, can't start with `RP-` or match a referral code, audited), `updateCoupon` (limits/expiry/active only, audited), `listCoupons` (with redemption counts).
- **tRPC**:
  - `redeemCode` (authProcedure, caller's own wallet). Rate limiting maps to `TOO_MANY_REQUESTS`; other code errors map to `BAD_REQUEST` with the message.
  - `admin.codes.{listCoupons, createCoupon, updateCoupon, flaggedReferrals, reviewReferral}`.
  - The context now carries `clientIp` (first `X-Forwarded-For` hop) and `deviceId` (optional `x-device-id` header) for the abuse checks.
- **Codes entered at sign-up** (`unsafeMetadata.referralCodeAtSignup`) are applied by `applySignupCodeOnce` on the dashboard, which loads right after verification.
  - Not applied in the webhook, which comes from Clerk's servers with no client IP, so signups would bypass the IP check.
  - The metadata is cleared after one try, and the dashboard shows whether the code was applied or why not.
  - Users who already redeemed a code skip the Clerk call entirely.

## Verified

- `pnpm turbo lint build test --force` with `DATABASE_URL`: 39/39 tasks. New tests: 17 service tests against real Postgres (both acceptance criteria, limits under concurrency, rate limit including the hour rolling over, IP and device flags, hashing, the mutual-referral deadlock case, reconciliation), 4 tRPC tests, 3 signup-code tests.
- The whole local DB reconciles (0 mismatches). The seeded EARLYBIRD coupon is untouched.

## Left for later

- `code_applied` and `referral_reward` emails: M11-02 (templates exist for welcome only).
- Admin coupon and referral-review pages: M12-03. Wallet "apply a code" UI: M12-01.
- The client doesn't send `x-device-id` yet; set a random id in localStorage once the wallet UI exists. Until then, flags rely on IP only.
- Set `ABUSE_HASH_SALT` on Railway (web service). Without it the hashes are unsalted SHA-256.
