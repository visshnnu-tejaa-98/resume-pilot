# Email sending pipeline

**Milestone:** M11 · prd.md §13.2
**Status:** todo

## Scope

1. Event (ledger row, redemption, webhook, scheduler, campaign) enqueues a BullMQ `email` job with idempotency key
2. Worker checks preferences + suppression list (marketing: preferences; both kinds: hard bounces)
3. Template renders to HTML + plain text with merge data
4. Nodemailer sends over SMTP to Amazon SES; `email_messages` row stores SES message id
5. SES delivery/bounce/complaint/open/click events → SNS → `/api/webhooks/email` (signature verified) → update status

- Transactional and marketing on separate queues so campaigns never delay receipts
- Campaign sends throttled (configurable per minute)
- Failed sends retry with backoff (3 attempts), then marked failed in log
- Daily scheduler job finds inactive users; delayed per-order job checks pending payments

## Done when

- A large simulated campaign send never delays a concurrent transactional email beyond its 2-minute SLA
- `payment_events`/`email_events`-style idempotent webhook handling confirmed for SNS payloads
