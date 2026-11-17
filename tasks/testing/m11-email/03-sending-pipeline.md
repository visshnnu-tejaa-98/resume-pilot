# Email sending pipeline

**Milestone:** M11 · prd.md §13.2
**Status:** testing

## Scope

1. An event (ledger row, redemption, webhook, scheduler, campaign) enqueues a BullMQ `email` job with an idempotency key
2. The worker checks preferences and the suppression list (marketing: preferences; both kinds: hard bounces)
3. The template renders to HTML + plain text with merge data
4. Nodemailer sends over SMTP (`sendEmail` in `packages/emails`). The `email_messages` row stores `provider_message_id` and status `sent`
5. A permanent SMTP rejection (5xx for the recipient) marks the row `failed` and adds the address to `email_suppressions` as a hard bounce. Transient errors (4xx, connection errors) retry.

- Plain SMTP gives no delivery, open, click or async-bounce events, so there's no `/api/webhooks/email` in Phase 1. `email_events` stays provider-neutral and unused.
- Transactional and marketing run on separate queues, so campaigns never delay receipts
- Campaign sends are throttled (configurable per minute, below the provider limit from M11-01)
- Failed sends retry with backoff (3 attempts), then are marked failed in the log
- A daily scheduler job finds inactive users; a delayed per-order job checks pending payments

## Done when

- A large simulated campaign send never delays a concurrent transactional email beyond its 2-minute SLA
- Re-running the same email job (same idempotency key) never sends twice (acceptance 16.2.16)
- A simulated 550 recipient rejection suppresses the address; a simulated 421 retries and then succeeds

## Progress

The `welcome` email is built on this pipeline (prd.md §13.1):

- `packages/queue` holds the queue names, Zod job payloads, and `enqueueTransactionalEmail`. The job id is the idempotency key, with `:` replaced by `-`. Jobs get 3 attempts with exponential backoff (10 s, 20 s).
- The Clerk webhook enqueues `welcome` on every `user.created` delivery and returns 500 if Redis is down, so Clerk retries.
- `apps/worker` consumes the `email-transactional` queue and calls `processTransactionalEmail` in `packages/services/src/email.ts`. That function:
  - logs an `email_messages` row (`welcome:<userId>`) before sending
  - runs the send under an advisory lock on that key, so the email goes out exactly once, even with concurrent duplicate jobs
  - skips suspended users and hard-bounced addresses (status `skipped`, migration 0003)
  - on a 5xx recipient rejection, marks the row failed and suppresses the address
  - on a transient error, retries, and marks the row failed on the final attempt
- The welcome template reads the launch coupon from `coupons` (`LAUNCH_COUPON_CODE`, default EARLYBIRD) and hides the gift block if the coupon is inactive. It also offers the 100-credit friend referral option.

Still to do here: a marketing queue with a campaign throttle, the remaining 5 transactional templates, the daily inactive-user scheduler, and the pending-payment delayed job.

## Completed (m11)

- **Marketing queue** (`email-marketing`): separate from transactional, with a BullMQ rate limiter of `EMAIL_CAMPAIGN_PER_MINUTE` (default 60), shared across worker instances. 3 attempts with backoff.
- **Checked at send time** for every marketing job, inside the per-key lock: consent for the category, any suppression, suspended user, and the admin template switch. An unsubscribe or switch-off mid-campaign stops all later sends.
- **Campaigns** ([email-marketing.ts](../../../packages/services/src/email-marketing.ts)):
  - Audience filters from §13.4, with a live count after exclusions.
  - Send now or schedule (IST), with an audit log entry.
  - The audience is frozen at start (one job per recipient, key `campaign:<id>:<user>`).
  - Cancel before start.
  - A `dispatch-campaigns` job (every minute) starts due campaigns and closes finished ones with sent/skipped counts.
  - "Send test to me" uses the admin's own merge data.
- **Inactive nudge:** a daily `inactive-nudges` job. `users.last_active_at` is touched at most hourly on app pages.
  - Nudge n is due after n × 30 days away, max 3 per absence. Signing in resets the clock, and a stale job is skipped.
  - After the first nudge, users with no credits who never topped up are skipped.
- **Pending payments:** a delayed `recharge_pending` job per order, plus the outbox sweep.
- **Replies** go to `EMAIL_REPLY_TO` / `SUPPORT_EMAIL` (Reply-To header).

## How to test

- `apps/worker`: `npx vitest run src/email-queues.test.ts` (needs local Redis). 2,000 throttled campaign jobs, then a receipt: the receipt is processed in seconds, and the campaign stays at its per-minute limit.
- `packages/services`: `email-m11.test.ts` covers campaigns, scheduling/cancel, mid-send unsubscribe and nudges.
- Manual: Admin → Emails → New campaign. Watch the live count, send a test to yourself, schedule one and cancel it, then send one.
