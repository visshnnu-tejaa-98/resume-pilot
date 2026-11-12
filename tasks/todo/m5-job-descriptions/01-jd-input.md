# JD input

**Milestone:** M5 · prd.md §7.1, §16.2.7
**Status:** todo

## Scope

- JD text field: required, 200–30,000 chars after trimming, enforced client AND server
- Optional: company name, job title, posting URL (stored only, not fetched in Phase 1)
- JDs saved per user, reusable across generations/scoring
- Editing JD text creates a new JD record + new analysis (old versions keep the JD they were built from)

## Done when

- A JD over 30,000 chars is rejected both client-side and server-side (acceptance criterion 16.2.7)
