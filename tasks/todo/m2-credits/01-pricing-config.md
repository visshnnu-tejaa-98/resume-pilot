# Pricing config

**Milestone:** M2 · prd.md §3.3, §3.6, §16.4
**Status:** todo

## Scope

- `pricing_config` table: model prices, USD→INR FX rate, markup multiplier, minimum charge per action — versioned, every charge records which version it used
- Credit calculation function: `credits = ceil((AI cost in INR × markup) / credit value)`
- Admin-editable (no deploy needed to change markup/minimums)

## Done when

- Changing markup in `pricing_config` affects new charges without a code deploy
- Every row in `ai_jobs` records the `pricing_config` version used
