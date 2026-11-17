# Admin dashboard overview

**Milestone:** M12 · prd.md §12.2, §16.2.15
**Status:** testing

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

## What was built (m12)

- **Overview** ([admin-insights.ts](../../../packages/services/src/admin-insights.ts) `adminInsights`), on top of the existing KPIs and unit economics:
  - AI reliability per action: runs, success %, failures, average latency, credits charged, AI cost.
  - Grounding violations per 100 generations, counting first-attempt violations fixed by the retry and generations blocked outright.
  - Refunds and net revenue.
  - Credits issued (purchased / coupon / referral / admin) vs consumed and refunded, plus outstanding liability.
  - Signups per day.
  - Email for the last 30 days: sent / failed / hard-bounced / unsubscribed. Opt-outs are now logged as `email_events` rows (`unsubscribed`).
- **User detail:**
  - Payments with refunds.
  - Email card: full address (only here), suppression state, marketing preferences, recent sends with errors.
  - Each version has **View content**, which needs a reason, writes `audit_logs` (`resume.view_content`) before returning content, and renders it in a dialog. Nothing is cached.

## How to test

- `admin-insights.test.ts`: covers the audit row for content views (including no reason and wrong user), grounding math, and unsubscribe counting.
- Manual: Admin → a user → View content, then check the Audit log.
