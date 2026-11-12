# Grounding + cost eval set

**Milestone:** M13 · prd.md §3.6, §16.2.8
**Status:** todo

## Scope

- 50 resume × JD pairs, including 10 with injected instructions, used to validate 0 grounding violations (feeds m6-generation/02)
- Same set used to measure average AI cost per action, informing markup/minimums in `pricing_config` (open decision §16.4)
- Automated eval harness (Vitest-based script) runnable in CI

## Done when

- Eval harness runs headlessly and reports grounding violation count + average cost per action type
