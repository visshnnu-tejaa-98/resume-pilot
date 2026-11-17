# Preferences and unsubscribe

**Milestone:** M11 · prd.md §13.5, §16.2.18
**Status:** testing

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

## What was built

- **Sign-up:** an unticked "reminders and product updates" checkbox, stored in Clerk metadata and applied once on the first dashboard load. An all-off preferences row is written either way, which marks the step done (no Clerk call on later loads).
- **Settings → Notifications:** Reminders and Product updates switches (tRPC `emailPreferences.get/set`). Account emails are listed as always on.
- **Consent records:** `consent_source` and `consent_at` are stored when a category is turned on. Turning one back on lifts an earlier unsubscribe-all; hard bounces stay.
- **Unsubscribe links:** every marketing email carries a signed link (HMAC with `EMAIL_UNSUBSCRIBE_SECRET`, one user + one category, no expiry) and `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
  - The link opens [/unsubscribe](../../../apps/web/app/(marketing)/unsubscribe/page.tsx), which applies the change immediately with no sign-in and shows per-category switches.
  - Mail clients' one-click POST goes to [/api/email/unsubscribe](../../../apps/web/app/api/email/unsubscribe/route.ts).
- **Suppression:** a hard bounce blocks every email; a complaint or unsubscribe-all blocks marketing only. Both are checked at send time.

## How to test

- `email-m11.test.ts`: covers no consent / complaint / suspended → no marketing (receipts still go), a forged token rejected, mid-campaign unsubscribe, and consent records.
- Manual: sign up with the box unticked and confirm Settings shows both off. Get a test campaign, click unsubscribe from a private window (no session) and confirm the page and Settings agree.
- **Not done:** hard bounces aren't shown on the admin user page yet (the data is in `email_suppressions`).
