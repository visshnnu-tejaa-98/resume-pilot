/**
 * Eval entry point (Vitest). Calls the real OpenAI API, so it's kept out of
 * the normal `pnpm test` run and skipped when OPENAI_API_KEY is unset.
 *
 *   pnpm --filter @resume-pilot/ai eval                 # all 50 pairs, gpt-5.1
 *   EVAL_MODEL=gpt-5-mini EVAL_LIMIT=10 pnpm --filter @resume-pilot/ai eval
 *
 * Writes eval/results/<timestamp>.json and eval/results/latest.md.
 * Fails if any saved generation has a grounding violation (§16.2.8).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOpenAIClient } from "../src/structure";
import { formatReport, runEval } from "./harness";
import { evalPricing } from "./pricing";

const hasKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasKey)("grounding + cost eval", () => {
  it("has 0 grounding violations in saved results and reports cost per action", async () => {
    const report = await runEval({
      client: createOpenAIClient(),
      pricing: evalPricing(),
      limit: process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : undefined,
      concurrency: Number(process.env.EVAL_CONCURRENCY ?? 4),
      log: (l) => console.log(l),
    });

    const dir = join(import.meta.dirname, "results");
    mkdirSync(dir, { recursive: true });
    const md = formatReport(report);
    writeFileSync(join(dir, `${report.finishedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(report, null, 2));
    writeFileSync(join(dir, "latest.md"), md);
    console.log(`\n${md}`);

    expect(report.grounding.violationsInSaved).toBe(0);
    expect(report.grounding.injectedSavedWithViolations).toBe(0);
  });
});
