/**
 * Generation eval (tasks m6/02, acceptance 16.2.8): runs all 50
 * resume×JD pairs through the real model and reports grounding results.
 *
 *   OPENAI_API_KEY=… pnpm --filter @resume-pilot/ai eval:generation
 *   (optional: GENERATION_MODEL, GENERATION_MAX_OUTPUT_TOKENS, EVAL_LIMIT)
 *
 * Pass criteria: 0 grounding violations in any *saved* (returned) result,
 * including the 10 injected pairs. A pair that fails grounding twice is
 * reported as "rejected" — that's the system working (nothing saved).
 */
import { createOpenAIClient } from "../src/structure";
import { EVAL_PAIRS, JD_ANALYSES, RESUMES } from "../src/generation/fixtures";
import { generateTailoredResume, GroundingFailedError } from "../src/generation/generate";
import { checkGrounding } from "../src/generation/grounding";

const model = process.env.GENERATION_MODEL ?? "gpt-5.1";
const maxOutputTokens = Number(process.env.GENERATION_MAX_OUTPUT_TOKENS ?? 6000);
const limit = Number(process.env.EVAL_LIMIT ?? EVAL_PAIRS.length);

async function main() {
  const client = createOpenAIClient();
  const rows: { pair: string; injected: boolean; outcome: string; attempts: number; firstAttempt: number; savedViolations: number }[] = [];
  for (const p of EVAL_PAIRS.slice(0, limit)) {
    const source = RESUMES[p.resume]!;
    const analysis = JD_ANALYSES[p.jd]!;
    try {
      const r = await generateTailoredResume(client, { source, analysis, model, maxOutputTokens });
      // Independent re-check of what would be saved.
      const again = checkGrounding({ source, output: r.resume, provenance: r.provenance, terms: { groups: analysis.requirements } });
      rows.push({ pair: `${p.resume}×${p.jd}`, injected: p.injected, outcome: "saved", attempts: r.attempts, firstAttempt: r.firstAttemptViolations.length, savedViolations: again.length });
    } catch (err) {
      const outcome = err instanceof GroundingFailedError ? `rejected (${err.violations.length})` : `error: ${(err as Error).message.slice(0, 60)}`;
      rows.push({ pair: `${p.resume}×${p.jd}`, injected: p.injected, outcome, attempts: 2, firstAttempt: 0, savedViolations: 0 });
    }
    console.log(rows.at(-1));
  }
  console.table(rows);
  const saved = rows.filter((r) => r.outcome === "saved");
  const bad = saved.reduce((n, r) => n + r.savedViolations, 0);
  console.log(`\nsaved ${saved.length}/${rows.length} · rejected ${rows.filter((r) => r.outcome.startsWith("rejected")).length} · retried ${saved.filter((r) => r.attempts === 2).length} · violations in saved: ${bad}`);
  console.log(`injected pairs saved with violations: ${saved.filter((r) => r.injected && r.savedViolations > 0).length}`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
