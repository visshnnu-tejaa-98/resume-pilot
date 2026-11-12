# Refunds

**Milestone:** M10 · prd.md §11.2, §11.3
**Status:** todo

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
