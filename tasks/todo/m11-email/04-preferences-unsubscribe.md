# Preferences and unsubscribe

**Milestone:** M11 · prd.md §13.5, §16.2.18
**Status:** todo

## Scope

- Marketing consent: unticked checkbox at signup (DPDP Act compliance)
- Settings → Notifications: Reminders, Product updates switches (Offers added later with promo emails); transactional listed as always-on
- Every marketing email: one-click unsubscribe (signed token, no sign-in) + `List-Unsubscribe` + `List-Unsubscribe-Post` headers
- Public unsubscribe page confirms change, lets user toggle individual categories
- Unsubscribe takes effect immediately, including mid-send campaigns
- Hard bounce → suppress all email; spam complaint → suppress marketing only; hard bounces on transactional shown on admin user page

## Done when

- Marketing email is never sent to a user without consent, unsubscribed, or suppressed (16.2.18)
- One-click unsubscribe works with no sign-in and takes effect immediately, even mid-campaign
