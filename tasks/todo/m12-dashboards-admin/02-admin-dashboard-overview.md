# Admin dashboard overview

**Milestone:** M12 · prd.md §12.2, §16.2.15
**Status:** todo

## Scope

- Users: total, paying, signups over time
- AI: actions by type, success/failure rate, avg latency, tokens, AI cost ₹, credits charged, margin per action type
- Grounding-check violations per 100 generations
- Revenue: top-ups, refunds
- Credits: issued (purchased/coupon/referral/admin) vs consumed; outstanding liability
- Email: sent/failed/hard-bounced/unsubscribed (last 30 days). Delivery and open rates aren't available over plain SMTP (prd.md §13.6)
- User detail: profile, ledger, payments, AI jobs, versions (metadata only; resume content visible only with logged admin access)

## Done when

- Viewing a user's resume content from admin writes an `audit_logs` row (logged admin access)
- All metrics in this page match acceptance criterion 16.2.15 (admins can view users, AI jobs/cost, ledger, payments, audited adjustments)
