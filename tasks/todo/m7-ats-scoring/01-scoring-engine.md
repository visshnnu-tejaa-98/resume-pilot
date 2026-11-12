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
