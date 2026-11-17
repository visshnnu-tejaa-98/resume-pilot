# ATS scoring engine

**Milestone:** M7 · prd.md §9.1
**Status:** todo

## Scope

1. AI call (Structured Outputs): per JD requirement from cached analysis → `matched|partial|missing`, evidencing resume item ids, one-line reason; plus formatting/content recommendations
2. Deterministic checks: keyword presence (exact + synonyms), standard section headings, contact info present, dates parseable, bullet length, page count
3. Score computed in code from 1+2 using weights: required keywords 30%, skills match 25%, experience relevance 20%, education 10%, structure/formatting 15%
4. Saved to `ats_reports` with content hash, JD id, scoring-method version, all inputs

## Done when

- Same resume content hash + same JD always produces the identical score (deterministic step verified by test)
- Report includes the disclaimer: "Estimated compatibility score. Employers' ATS systems differ; this is not a guarantee."

## Implementation

- `packages/ai/src/scoring/`: the model only judges evidence (`score.ts`, prompt `ats-eval-v1`). Code computes the score (`engine.ts`, method `ats-v1`): weights 30/25/20/10/15, keyword and synonym hits, structure checks, years of experience. Evidence ids not in the resume are dropped.
- `buildReport` stores every input in `ats_reports.report`, so a score can be recomputed exactly.
- `packages/services/src/scoring.ts` runs estimate → hold → capture and analyses the job first when needed. The worker job is `ats-scoring`.

## How to test

- `pnpm --filter @resume-pilot/ai test` (determinism, fake evidence, hidden items).
- `services` scoring tests run with DATABASE_URL set.
- Manual: Generate → Score mode → confirm. The report appears after polling.
