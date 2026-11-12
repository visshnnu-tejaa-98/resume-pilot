# Generation flow

**Milestone:** M6 · prd.md §8.1, §16.2.3
**Status:** todo

## Scope

1. User picks source version + JD
2. If JD has no analysis, include it in the estimate and run first
3. Confirmation dialog: target job title/company, what will run, credit estimate, balance after — hold placed only on Confirm
4. Worker: OpenAI Responses API with Structured Outputs — original resume JSON + JD analysis + rules → generated resume JSON + provenance + gap list
5. Zod validation → grounding check (see 02-grounding-check.md)
6. Save as new `resume_versions` row (`kind = generated`, `parentVersionId`, `jdId`)
7. Capture hold, route to editor

Editor shows a separate "Score this resume" action with its own estimate — generation never produces the ATS score.

## Done when

- Estimate dialog always shown before any hold is placed; Cancel charges nothing (16.2.3)
- Every generation produces a new, independent `resume_versions` row
