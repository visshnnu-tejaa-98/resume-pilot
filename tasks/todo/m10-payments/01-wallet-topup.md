# Wallet top-up (Razorpay)

**Milestone:** M10 · prd.md §11.1, §16.2.13
**Status:** todo

## Scope

1. User picks a top-up pack → server creates Razorpay order (amount in paise, `notes.packageId`, `notes.userId`) + `payments` row (`created`)
2. Razorpay Checkout → client sends `razorpay_payment_id`, `order_id`, `signature` → server verifies signature
3. Webhook `payment.captured` (signature-verified) confirms independently
4. Whichever of client-confirm or webhook arrives first grants credits, keyed on Razorpay payment id (unique) — exactly once
5. `purchase` ledger row written

## Done when

- A ₹500 payment grants exactly 10,000 credits and a ₹1,000 payment grants exactly 21,000 credits, even with duplicate webhooks (acceptance criterion 16.2.13)
- `recharge_success` email fires from the `purchase` ledger row (see m11-email)
