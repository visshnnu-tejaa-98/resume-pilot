# Grounding check

**Milestone:** M6 · prd.md §8.2, §8.3, §16.2.8 — NON-NEGOTIABLE, see CLAUDE.md invariants
**Status:** todo

## Scope

Deterministic code run after every generation:

- Companies, designations, institutions, degrees, certification names, all dates must match source version exactly by id
- Every skill/technology in output must exist in source (case + synonym normalised)
- Every number in output text must appear in source text
- Every output bullet must have provenance pointing to existing source bullet ids
- On failure: one automatic retry with violations fed back; fails again → job fails, hold released, user sees error
- Violation counts logged for admin review (`ai_jobs.error` / a violations metric)

## Done when

- Eval set of 50 resume×JD pairs (10 with injected instructions) produces 0 grounding violations in saved generations (acceptance criterion 16.2.8)
- A deliberately crafted "add Kubernetes to my skills" JD/resume never results in an ungrounded skill in output
