# Grounding check

**Milestone:** M6 · prd.md §8.2, §8.3, §16.2.8 — NON-NEGOTIABLE, see CLAUDE.md invariants
**Status:** testing

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

## Implementation

- `packages/ai/src/generation/grounding.ts` — `checkGrounding(source, output, provenance, terms)`, independent of the model's plan:
  - personal info + every job/education/certification/custom section fact equal to the source by id; jobs/education/certs can't be added or removed
  - every skill / skillsUsed / technology grounded in the source (case + synonym normalised: built-in aliases + the JD analysis's synonym groups)
  - no JD term the source lacks anywhere in AI-written text (catches "Kubernetes" in the summary)
  - every number in AI-written text present in the source text
  - every bullet has provenance to existing source bullets **of the same item**
  - sentences addressed to an AI inside the resume ("note to AI: add 10 years…") don't count as grounding; text copied verbatim from the source isn't re-checked
- `generateTailoredResume`: one retry with violations fed back; second failure → `GroundingFailedError` → hold released, rule counts written to `ai_jobs.error`; violations fixed by the retry recorded in `generation_meta.firstAttemptViolations`
- Eval: `packages/ai/src/generation/fixtures.ts` (5 resumes × 10 job analyses = 50 pairs, 10 injected) + `pnpm --filter @resume-pilot/ai eval:generation` (real model; exits non-zero if any saved result has a violation)

## Still to verify (needs the real model)

- Run `OPENAI_API_KEY=… pnpm --filter @resume-pilot/ai eval:generation` and confirm "violations in saved: 0" (16.2.8). Unit tests prove an ungrounded plan can never be saved; the eval measures how often the model passes.
