# Grounding + cost eval set

**Milestone:** M13 · prd.md §3.6, §16.2.8
**Status:** testing — harness built and smoke-run; full 50-pair run pending (see Progress)

## Scope

- 50 resume × JD pairs, including 10 with injected instructions, used to validate 0 grounding violations (feeds m6-generation/02)
- Same set used to measure average AI cost per action, informing markup/minimums in `pricing_config` (open decision §16.4)
- Automated eval harness (Vitest-based script) runnable in CI

## Done when

- Eval harness runs headlessly and reports grounding violation count + average cost per action type

## Progress

- Harness: [packages/ai/eval/](../../../packages/ai/eval/) — `harness.ts` (runs + aggregates), `run.eval.ts` (Vitest entry), `pricing.ts` (costing config), `jd-texts.ts` (10 raw JD texts, 2 injected). Replaces the old `eval/generation.ts` script.
- Per run: JD analysis on 10 raw JDs, generation on 50 resume × JD pairs (10 injected) with an independent grounding re-check, ATS scoring of every saved generation.
- Reports violations in saved results (test fails if > 0), and per action: avg/p95 tokens and ₹ cost, actual vs estimated credits, calls over the estimate.
- Run: `pnpm --filter @resume-pilot/ai eval` (needs `OPENAI_API_KEY`; skipped without it). Options: `EVAL_MODEL`, `EVAL_LIMIT`, `EVAL_CONCURRENCY`, `EVAL_PRICING_FILE`. Output: `packages/ai/eval/results/latest.md` + timestamped JSON (gitignored).
- Kept out of `pnpm test` (`*.eval.ts`, own `vitest.eval.config.ts`).

### Smoke run (2026-11-25, gpt-5-mini, 2 pairs)

- 0 grounding violations; ~₹0.27–0.34 AI cost per action.
- **Finding:** 1 of 10 JD analyses failed with `max_output_tokens` — gpt-5 reasoning tokens count against the 2,000 output budget; successful calls used 1,009–1,944. Raise `jd_analysis.maxOutputTokens` (and check generation/scoring headroom) before relying on gpt-5-mini.

### Left

- Full 50-pair run on the production model, then set markup/minimums (§16.4) from the report.
- Failed calls are recorded at 0 usage (the error doesn't carry usage), so platform cost of failures is under-reported.
- CI: no `.github/workflows` yet — add a manual/nightly job with `OPENAI_API_KEY` as a secret (it costs money per run, so not on every PR).
