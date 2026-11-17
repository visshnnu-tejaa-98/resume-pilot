# Original vs generated comparison

**Milestone:** M7 · prd.md §9.4, §16.2.11
**Status:** todo

## Scope

- Compare picks two versions (default: original vs a generated version) + one JD
- Each side uses its cached report if current, otherwise runs scoring (charged); estimate shows only the parts that need to run
- Compare view: both scores, per-dimension change, keywords gained, gaps still open — no extra AI call beyond the two scores

## Done when

- Comparison view shows both scores and per-dimension change (acceptance criterion 16.2.11)
- If both sides already have current cached reports, Compare costs 0 credits

## Implementation

- `/versions/:id/compare?a=&jd=`: A defaults to the parent version and B is this version.
- When both have a current report, the comparison is free. Otherwise `CompareRunner` shows only the sides that need scoring, with the job analysis counted once, then confirms, polls and reloads.

## How to test

Open Compare on a tailored version that has no scores yet. It shows an estimate, then runs and displays the table.
