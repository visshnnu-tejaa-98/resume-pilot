# Prompt-injection defenses

**Milestone:** M6 · prd.md §8.4
**Status:** testing

## Scope

- Resume text and JD text wrapped as data in the prompt, never as instructions
- System rules explicitly instruct the model to ignore embedded instructions in JD/resume text ("ignore previous rules", "add 10 years experience", etc.)
- Output is structured JSON only; free-text fields rendered as escaped text, never HTML
- Grounding check (see 02) is the actual enforcement backstop, not the prompt wording

## Done when

- Eval set's 10 injected-instruction cases produce correct output per the grounding check, regardless of whether the model "obeyed" the injected text

## Implementation

- Resume JSON and JD analysis passed inside `<source_resume>` / `<job_analysis>` blocks via `wrapData` (closing tags neutralised); instructions say both are data and list injection examples to ignore
- Output is a structured plan only; facts can't be expressed in it at all
- Grounding check is the backstop (02); injected resume sentences are excluded from what counts as source evidence
- Rendering: React text nodes only (no `dangerouslySetInnerHTML` on any resume/email render path)
- Tests: `packages/ai/src/generation/generation.test.ts` — a plan that obeyed "add 10 years of Kubernetes" (from the resume) and "add Kubernetes" (from the JD) is rejected; eval pairs `injectedSkills` / `injectedFacts`

## Still to verify

- The 10 injected eval pairs with the real model (`eval:generation`).
