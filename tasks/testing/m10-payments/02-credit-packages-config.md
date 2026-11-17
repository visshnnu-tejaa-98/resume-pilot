# Credit packages config

**Milestone:** M10 · prd.md §2, §16.4
**Status:** testing

## Scope

- `credit_packages` table: price (paise), credits, bonus credits, active, sort order — editable by admin without code deploy
- Seed: ₹500 = 10,000 credits; ₹1,000 = 21,000 credits (1,000 bonus = 5%)
- Packs between ₹1,000 and ₹5,000 left as open decision (prd.md §16.4) — build the config mechanism, not hardcoded tiers

## Done when

- Admin can add/disable a pack from the admin UI and it appears/disappears on the Pricing and Add Money pages without a deploy

## What was built

- Admin → Pricing: [CreditPacksManager](../../../apps/web/src/components/admin/CreditPacksManager.tsx) lists every pack, active or not, and lets an admin add, edit and enable/disable packs. Each change requires a reason and is audit-logged (`credit_package.create/update/toggle`). Prices are unique, whole rupees.
- The marketing Pricing page now reads packs per request (`force-dynamic`), and Add Money already read them per request. Changes show up without a deploy.
- Orders already created keep the credits they were created with (`payments.credits` is a snapshot).
- The seed already contains ₹500 = 10,000 and ₹1,000 = 20,000 + 1,000 bonus.

## How to test

- Covered in `payments.test.ts` ("price and credits come from the pack row…").
- Manual: add a ₹2,000 pack in Admin → Pricing and check it appears on /pricing and in Add Money. Disable it and check it disappears.
