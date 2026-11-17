# Transactional email templates

**Milestone:** M11 · prd.md §13.1, §13.3, §16.2.16, §16.2.17, §16.2.21
**Status:** testing

## Scope

React Email components in `packages/emails`, one per template key: `welcome`, `code_applied`, `referral_reward`, `recharge_success`, `recharge_failed`, `recharge_pending`.

- Table-based layout, inline styles, 600px wide, system font fallbacks, light/dark mode — tested in Gmail, Outlook, Apple Mail
- Plain-text version for every template
- Shared header/footer; transactional footer states it's a service email about the account
- Merge fields: `{first_name}`, `{balance}`, `{credits}`, `{amount}`, `{payment_id}`, `{referral_code}`, `{segment_reason}`
- Idempotency key = template key + source id (user/redemption/payment) — duplicate webhooks/retries never send twice

## Done when

- All 6 transactional templates render correctly, light+dark, in Gmail/Outlook/Apple Mail (16.2.21)
- Each sends exactly once per event under duplicate webhook/retry simulation (16.2.16)
- `recharge_success` arrives within 2 minutes of the ledger write (16.2.17)

## What was built

- **All 6 templates send.** `referral_reward` is new ([ReferralReward.tsx](../../../packages/emails/src/templates/ReferralReward.tsx)); the others already existed. Processors are in [email-transactional.ts](../../../packages/services/src/email-transactional.ts) and `recharge_success` is in `email.ts`.
- **Facts come from the triggering row** (ledger entry, redemption or payment). Each processor re-checks the trigger before sending: a pending email is skipped if the payment was captured; a failed email is skipped if a retry succeeded.
- **Suspended users:** money emails still reach them; the code and referral emails don't (§13.1).
- **Idempotency keys:** `code_applied:<redemption>`, `referral_reward:<redemption>`, `recharge_*:<payments.id>`, all through the shared exactly-once `deliverOnce`.
- **Triggers:**
  - `code_applied`: when a code is redeemed (tRPC and sign-up).
  - `recharge_pending`: a delayed job 10 min after the order is created.
  - `recharge_failed`: the `payment.failed` webhook.
  - `referral_reward`: the outbox sweep.
- **Outbox sweep** (worker, every minute, `findMissingTransactionalEmails`): queues any email whose ledger row, failed payment or 10-min-old pending order has no `email_messages` row. A lost enqueue is therefore recovered within about 1 minute, and admin-approved referral rewards are picked up there.
- **Names:** `users.first_name` (from Clerk) is now used for greetings.
- **Admin catalogue:** preview keys now match the catalogue (`recharge_*`, not `payment_*`).

## How to test

- `packages/services`: `DATABASE_URL=… npx vitest run src/email-m11.test.ts`. Covers once-only under concurrent duplicates, pending/failed re-checks, suspended users, the outbox sweep, and 550 → suppress / 421 → retry then send.
- Still manual (16.2.21): open each template in Admin → Email templates → Preview (light/dark) and send real ones to Gmail, Outlook and Apple Mail. This needs SMTP from task 01.
- 16.2.17 (receipt within 2 min): the receipt is queued on the grant itself, with the sweep as a 1-min backstop. Confirm on staging once SMTP is live.
