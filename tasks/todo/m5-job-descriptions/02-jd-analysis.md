# JD analysis (charged, cached)

**Milestone:** M5 · prd.md §7.2, §3.2
**Status:** todo

## Scope

- Structured output matching §7.2 shape: jobTitle, seniority, minYearsExperience, requirements[] (id, text, type, priority, keywords, synonyms), educationRequirements, domainTerms
- Stored in `jd_analyses`, unique per `jd_id`
- Charged once per JD; generation/scoring/comparison reuse it at no extra cost
- Runs through the estimate → hold → capture flow (packages/credits)

## Done when

- Re-running generation or scoring on a JD with an existing analysis never triggers a second analysis charge
