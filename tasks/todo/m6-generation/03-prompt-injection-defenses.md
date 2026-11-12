# Prompt-injection defenses

**Milestone:** M6 · prd.md §8.4
**Status:** todo

## Scope

- Resume text and JD text wrapped as data in the prompt, never as instructions
- System rules explicitly instruct the model to ignore embedded instructions in JD/resume text ("ignore previous rules", "add 10 years experience", etc.)
- Output is structured JSON only; free-text fields rendered as escaped text, never HTML
- Grounding check (see 02) is the actual enforcement backstop, not the prompt wording

## Done when

- Eval set's 10 injected-instruction cases produce correct output per the grounding check, regardless of whether the model "obeyed" the injected text
