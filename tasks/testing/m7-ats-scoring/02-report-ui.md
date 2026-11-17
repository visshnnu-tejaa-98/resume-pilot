# ATS report UI

**Milestone:** M7 · prd.md §9.2
**Status:** todo

## Scope

- Overall score, per-dimension breakdown, one-paragraph assessment
- Matched keywords/skills, each linked to the resume line that proves it
- Missing keywords and skill gaps (required vs preferred) — the gap list from generation surfaces here too
- Recommendations: summary, ordering, bullet clarity, formatting

## Done when

- Every matched keyword links to a specific resume line/item id

## Implementation

- `loadAtsReport` (apps/web/src/server/versions.ts) maps the stored report to the report screen.
- Each matched keyword links to `/versions/:id#item-<bulletId>`. The editor bullets now carry these anchors.
- When a version has no score, the page shows a job picker with a "See estimate" button. `?job=` polls the running job.

## How to test

Score a version, open the report, then click a matched keyword's evidence. The editor scrolls to that bullet and highlights it.
