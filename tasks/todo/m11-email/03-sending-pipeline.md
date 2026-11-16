# Email sending pipeline

**Milestone:** M11 · prd.md §13.2
**Status:** todo

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
