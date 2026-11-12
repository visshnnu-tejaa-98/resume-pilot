# Transactional email templates

**Milestone:** M11 · prd.md §13.1, §13.3, §16.2.16, §16.2.17, §16.2.21
**Status:** todo

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
