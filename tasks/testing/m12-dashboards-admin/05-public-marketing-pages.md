# Public marketing pages

**Milestone:** M12 · prd.md §4.1
**Status:** testing

## Scope

- Landing, Pricing (top-up packs + typical credits per action once measured, §3.6), How It Works, About, Contact
- Privacy Policy, Terms, Refund Policy
- Login, Sign-up (Clerk custom-styled, marketing-consent checkbox unticked by default)
- Email preferences / Unsubscribe page (token link, no sign-in — shared with m11-email/04)

## Done when

- All public pages listed in §4.1 exist and link correctly from the header/footer
- Pricing page shows typical credits per action once the eval set (m13) publishes real numbers

## Status check (m12)

- **Pages:** Landing, Pricing, How it works, About, FAQ, Contact, Privacy, Terms, Refunds and Unsubscribe all exist and are linked from the header and footer. Sign-in and sign-up are custom Clerk UI, with an unticked marketing-consent box (m11).
- **Pricing typical credits:** each action now shows the median actually charged over the last 30 days, once that action has ≥ 20 successful runs (`typicalCreditsPerAction`). Until then it says "Shown after launch".
  - The done-when is met automatically once real or eval runs (m13) exist; no code change is needed.
