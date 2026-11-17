# Refunds

**Milestone:** M10 · prd.md §11.2, §11.3
**Status:** testing

## Scope

- Admin-initiated refund within 6 months of purchase, unused purchased credits only
- Bonus packs refunded pro rata: unused credits × (amount paid ÷ credits in pack)
- Coupon and referral credits never refundable
- Ledger debits credits before Razorpay refund is issued
- AI failures never need refunds (holds auto-release, see m2-credits)
- Money stored as integer paise; unique constraints on Razorpay order id and payment id; idempotent webhook handler storing raw events (`payment_events`)
- No GST for now; final-amount pricing; receipt issued per payment

## Done when

- A refund request outside the 6-month window or on coupon/referral credits is blocked by the app, not just policy
- Pro-rata bonus refund math verified against a worked example

## What was built

- **Schema:** a new `refunds` table (migration 0012), one refund per payment, with `pending → processing → processed | failed`. `payments` gains `method`, `captured_at` and `failure_reason`.
- **Quote** (`quoteRefund`) is blocked when the payment isn't captured, was already refunded, or was captured more than 6 calendar months ago.
  - Unused purchased credits are found by walking the ledger in order. Spends use gift credits (coupon, referral, positive admin adjustments) first, but only gifts that existed at that moment. Active holds are reserved the same way.
  - So coupon and referral credits are never refundable, and this is enforced by code.
- **Pro rata:** `floor(unused × paid ÷ pack credits)`. Worked example: ₹1,000 / 21,000 credits with 7,000 used refunds 14,000 credits as ₹666.66.
- **`refundPayment`:** in one transaction (payment row and wallet locked), it inserts the refund, debits the ledger, marks the payment `refunded` and writes the audit log. Only then does it call Razorpay. If Razorpay fails, the refund stays `pending` and admin can press "Retry with Razorpay". A retry first checks the payment's existing Razorpay refunds (`notes.refund_id`), so a lost response can't refund twice.
- **UI:** a refund panel on Admin → Payments shows the quote, the window and a credit amount with a live pro-rata preview.

## How to test

- `payments.test.ts`: the worked example, the 6-month block, the coupon-only block, gifts-first and holds, a too-large amount, an outage then retry without a double refund, and the `refund.processed` webhook.

## Open decisions

- The gifts-first rule is my reading of "unused purchased credits" (prd.md §11.2 doesn't say which credits are spent first). It is the most user-friendly option; confirm with the business.
