# JD analysis (charged, cached)

**Milestone:** M5 · prd.md §7.2, §3.2
**Status:** testing

## Scope

- Structured output matching §7.2 shape: jobTitle, seniority, minYearsExperience, requirements[] (id, text, type, priority, keywords, synonyms), educationRequirements, domainTerms
- Stored in `jd_analyses`, unique per `jd_id`
- Charged once per JD; generation/scoring/comparison reuse it at no extra cost
- Runs through the estimate → hold → capture flow (packages/credits)

## Done when

- Re-running generation or scoring on a JD with an existing analysis never triggers a second analysis charge

## Implementation

- Schema: `packages/validators/src/jd-analysis.ts` — §7.2 shape; strict OpenAI schema derived from Zod; requirement ids `r1…rN` app-assigned
- AI call: `packages/ai/src/jd-analysis.ts` — JD passed as delimited data (§8.4); model + output cap from the pricing version the estimate used
- Charging: `packages/services/src/jd-analysis.ts` — cached analysis is never re-run or re-charged; hold key `jd_analysis:<jdId>:<attempt>` dedupes double clicks/concurrent confirms; refuses a hold above the confirmed estimate; failure releases in full
- Queue/worker: `ai-jobs` queue (`enqueueJdAnalysis`), `createAiWorker` in apps/worker
- API: `jds.analysis`, `jds.estimateAnalysis`, `jds.analyze` (queue failure releases the hold)
- UI: analysis panel on `/jobs/[id]`; job cards show headline keywords once analysed

## How to test

1. Run web + worker with `OPENAI_API_KEY`, Redis and a wallet balance.
2. Open a saved job → "Analyse this job" → confirm the estimate.
3. Panel shows "Analysing…", then the requirements; wallet shows one capture ≤ the estimate, nothing left on hold.
4. Reload / open Generate for the same job: no analysis step, no second charge.
5. Failure path: unset `OPENAI_API_KEY` on the worker, analyse another job → panel says it failed and nothing was charged.

Automated: `packages/services/src/jd-analysis.test.ts` (real DB) covers the done-when, concurrency, failure/retry, estimate cap, insufficient balance and tenancy.
