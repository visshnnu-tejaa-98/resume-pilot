# Auth: Clerk integration

**Milestone:** M1
**Status:** todo

## Scope

- Wire up Clerk in `apps/web`: Google OAuth, LinkedIn OAuth, email; custom-styled sign-in/sign-up
- `user.created` webhook (`/api/webhooks/clerk`, raw body + signature verified) that idempotently creates: app `users` row, empty `credit_accounts` row (0 credits), and the user's `referral_codes` row
- Role (`user` | `admin`) stored in DB + Clerk private metadata, never writable from the client
- `authProcedure` and `adminProcedure` in `packages/trpc` that resolve the user server-side

## Done when

- Signing up via any method lands on Dashboard with a 0-credit wallet and a referral code already generated
- Duplicate webhook delivery does not create duplicate users/wallets (idempotency key = Clerk user id)
