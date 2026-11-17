# Wallet top-up (Razorpay)

**Milestone:** M10 · prd.md §11.1, §16.2.13
**Status:** testing

## Scope

1. User picks a top-up pack → server creates Razorpay order (amount in paise, `notes.packageId`, `notes.userId`) + `payments` row (`created`)
2. Razorpay Checkout → client sends `razorpay_payment_id`, `order_id`, `signature` → server verifies signature
3. Webhook `payment.captured` (signature-verified) confirms independently
4. Whichever of client-confirm or webhook arrives first grants credits, keyed on Razorpay payment id (unique) — exactly once
5. `purchase` ledger row written

## Done when

- A ₹500 payment grants exactly 10,000 credits and a ₹1,000 payment grants exactly 21,000 credits, even with duplicate webhooks (acceptance criterion 16.2.13)
- `recharge_success` email fires from the `purchase` ledger row (see m11-email)

## What was built

- **Service:** [payments.ts](../../../packages/services/src/payments.ts) and a fetch-based [Razorpay client](../../../packages/services/src/razorpay.ts) (no SDK).
  - `createTopUpOrder` reads price and credits from the pack row and snapshots them on `payments`.
  - `confirmCheckout` (signature-verified, then fetches the payment from Razorpay) and the webhook both call `grantPayment`. It locks the payment row, checks the order and amount match, and posts the `purchase` ledger entry keyed on the payment. Duplicate and concurrent confirmations grant once.
  - A failed attempt marks the order `failed`; a later successful attempt on the same order still grants.
- **tRPC:** `payments.createOrder` and `payments.confirm`.
- **Webhook:** [api/webhooks/razorpay](../../../apps/web/app/api/webhooks/razorpay/route.ts). Verifies the HMAC on the raw body and stores every raw event once in `payment_events` (unique event id). Handles `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and `refund.failed`.
- **UI:** Add Money opens Razorpay Checkout and then the existing payment result page, which reads its status from the DB.
- **Receipt:** `recharge_success` is a new transactional email job (key `recharge_success:<payments.id>`). It is queued by whichever confirmation sees the payment captured, and only sent if a `purchase` ledger row exists. The welcome email's exactly-once send logic was pulled into a shared `deliverOnce` helper.
- **Env:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (see `apps/web/.env.example`). Without the keys, Pay stays disabled with the existing notice.

## How to test

- `packages/services`: `DATABASE_URL=… npx vitest run src/payments.test.ts`. Covers ₹500 → 10,000 and ₹1,000 → 21,000 with duplicate and racing webhooks, bad signature, another user's order, wrong amount, failed-then-retried payment, and the receipt sent once.
- `apps/web`: `npx vitest run app/api/webhooks/razorpay`.
- Manual (Razorpay test mode): add the keys and point a webhook at `<tunnel>/api/webhooks/razorpay`. Pay with a test card and confirm the balance rises once. Resend the webhook from the dashboard and confirm the balance doesn't change.
