# Credit packages config

**Milestone:** M10 · prd.md §2, §16.4
**Status:** todo

## Scope

- `credit_packages` table: price (paise), credits, bonus credits, active, sort order — editable by admin without code deploy
- Seed: ₹500 = 10,000 credits; ₹1,000 = 21,000 credits (1,000 bonus = 5%)
- Packs between ₹1,000 and ₹5,000 left as open decision (prd.md §16.4) — build the config mechanism, not hardcoded tiers

## Done when

- Admin can add/disable a pack from the admin UI and it appears/disappears on the Pricing and Add Money pages without a deploy
