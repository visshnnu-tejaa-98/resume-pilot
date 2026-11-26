/**
 * Grounding + cost eval (tasks/todo/m13-testing-deploy/01, prd.md §3.6, §16.2.8).
 *
 * Runs the real model over the fixture set:
 *   - JD analysis on each of the 10 raw JD texts (2 injected)
 *   - generation on all 50 resume × JD pairs (10 injected), with an
 *     independent grounding re-check of every saved result
 *   - ATS scoring of every saved generation
 * and reports grounding violations plus actual vs. estimated cost per
 * action, using the same estimate formula the app shows users.
 */
import { calculateCredits, estimateCredits, type PricingConfig } from "@resume-pilot/credits";
import type { PaidAction } from "@resume-pilot/validators";
import type { Resume } from "@resume-pilot/validators/resume";
import { analyzeJobDescription } from "../src/jd-analysis";
import { EVAL_PAIRS, JD_ANALYSES, RESUMES } from "../src/generation/fixtures";
import { generateTailoredResume, GroundingFailedError } from "../src/generation/generate";
import { checkGrounding } from "../src/generation/grounding";
import { scoreResume } from "../src/scoring/report";
import type { ResponsesClient, StructureUsage } from "../src/structure";
import { INJECTED_JD_KEYS, JD_TEXTS, jdText } from "./jd-texts";

export interface EvalOptions {
  client: ResponsesClient;
  pricing: PricingConfig;
  /** Max resume × JD pairs (default all 50). */
  limit?: number;
  /** Parallel AI calls. */
  concurrency?: number;
  log?: (line: string) => void;
}

export interface CallRecord {
  action: PaidAction;
  label: string;
  injected: boolean;
  ok: boolean;
  usage: StructureUsage;
  costInr: number;
  actualCredits: number;
  estimateCredits: number;
  error?: string;
}

export interface GenerationRecord {
  pair: string;
  injected: boolean;
  outcome: "saved" | "rejected" | "error";
  attempts: number;
  firstAttemptViolations: number;
  savedViolations: number;
  detail?: string;
}

export interface ActionSummary {
  action: PaidAction;
  model: string;
  calls: number;
  failed: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCostInr: number;
  p95CostInr: number;
  maxCostInr: number;
  avgActualCredits: number;
  avgEstimateCredits: number;
  /** Calls whose actual credits exceeded the estimate shown to the user (§3.4: must be 0 after capping). */
  overEstimate: number;
}

export interface EvalReport {
  startedAt: string;
  finishedAt: string;
  pricingConfigVersion: number;
  markupMultiplier: number;
  creditValueInr: number;
  actions: ActionSummary[];
  grounding: {
    pairs: number;
    saved: number;
    rejected: number;
    errors: number;
    retried: number;
    violationsInSaved: number;
    injectedPairs: number;
    injectedSavedWithViolations: number;
  };
  generations: GenerationRecord[];
  calls: CallRecord[];
}

const USAGE0: StructureUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

/** Runs `fn` over `items` with at most `n` in flight, preserving order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p95 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
};

export async function runEval(opts: EvalOptions): Promise<EvalReport> {
  const { client, pricing } = opts;
  const concurrency = opts.concurrency ?? 4;
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();
  const calls: CallRecord[] = [];
  const setting = (a: PaidAction) => pricing.actionSettings[a];

  const record = (action: PaidAction, label: string, injected: boolean, inputParts: string[], usage: StructureUsage, ok: boolean, error?: string) => {
    const model = setting(action).model;
    const actual = calculateCredits(pricing, model, usage);
    const est = estimateCredits(pricing, action, inputParts);
    const rec: CallRecord = { action, label, injected, ok, usage, costInr: actual.costInr, actualCredits: actual.credits, estimateCredits: est.credits, error };
    calls.push(rec);
    log(`${action.padEnd(12)} ${label.padEnd(28)} ${ok ? "ok " : "ERR"} in=${usage.inputTokens} out=${usage.outputTokens} ₹${actual.costInr.toFixed(3)} credits ${actual.credits}/${est.credits}${error ? ` — ${error}` : ""}`);
  };

  // 1. JD analysis on raw texts.
  const jdKeys = Object.keys(JD_TEXTS);
  await pool(jdKeys, concurrency, async (key) => {
    const s = setting("jd_analysis");
    const text = jdText(key);
    try {
      const r = await analyzeJobDescription(client, { jdText: text, model: s.model, maxOutputTokens: s.maxOutputTokens });
      record("jd_analysis", key, INJECTED_JD_KEYS.has(key), [text], r.usage, true);
    } catch (err) {
      record("jd_analysis", key, INJECTED_JD_KEYS.has(key), [text], USAGE0, false, (err as Error).message.slice(0, 120));
    }
  });

  // 2. Generation (+ grounding re-check) and 3. ATS scoring of what would be saved.
  const pairs = EVAL_PAIRS.slice(0, opts.limit ?? EVAL_PAIRS.length);
  const generations = await pool(pairs, concurrency, async (p): Promise<GenerationRecord> => {
    const source = RESUMES[p.resume]!;
    const analysis = JD_ANALYSES[p.jd]!;
    const jd = jdText(p.jd);
    const label = `${p.resume}×${p.jd}`;
    const parts = [JSON.stringify(source), jd];
    const g = setting("generation");
    let saved: Resume | null = null;
    let rec: GenerationRecord;
    try {
      const r = await generateTailoredResume(client, { source, analysis, model: g.model, maxOutputTokens: g.maxOutputTokens });
      const again = checkGrounding({ source, output: r.resume, provenance: r.provenance, terms: { groups: analysis.requirements } });
      record("generation", label, p.injected, parts, r.usage, true);
      saved = r.resume;
      rec = { pair: label, injected: p.injected, outcome: "saved", attempts: r.attempts, firstAttemptViolations: r.firstAttemptViolations.length, savedViolations: again.length, detail: again.slice(0, 3).map((v) => `${v.rule}@${v.path}: ${v.value}`).join("; ") || undefined };
    } catch (err) {
      // Usage of failed attempts isn't surfaced by the error; the app releases the hold in full anyway.
      const rejected = err instanceof GroundingFailedError;
      record("generation", label, p.injected, parts, USAGE0, false, rejected ? "grounding rejected" : (err as Error).message.slice(0, 120));
      rec = { pair: label, injected: p.injected, outcome: rejected ? "rejected" : "error", attempts: 2, firstAttemptViolations: rejected ? err.violations.length : 0, savedViolations: 0, detail: rejected ? undefined : (err as Error).message.slice(0, 160) };
    }

    if (saved) {
      const s = setting("ats_scoring");
      const scoreParts = [JSON.stringify(saved), jd];
      try {
        const r = await scoreResume(client, { resume: saved, analysis, model: s.model, maxOutputTokens: s.maxOutputTokens, asOf: new Date() });
        record("ats_scoring", label, p.injected, scoreParts, r.usage, true);
      } catch (err) {
        record("ats_scoring", label, p.injected, scoreParts, USAGE0, false, (err as Error).message.slice(0, 120));
      }
    }
    return rec;
  });

  const actions = (["jd_analysis", "generation", "ats_scoring"] as const).map((action): ActionSummary => {
    const all = calls.filter((c) => c.action === action);
    const ok = all.filter((c) => c.ok);
    const cost = ok.map((c) => c.costInr);
    return {
      action,
      model: setting(action).model,
      calls: all.length,
      failed: all.length - ok.length,
      avgInputTokens: Math.round(avg(ok.map((c) => c.usage.inputTokens))),
      avgOutputTokens: Math.round(avg(ok.map((c) => c.usage.outputTokens))),
      avgCostInr: avg(cost),
      p95CostInr: p95(cost),
      maxCostInr: Math.max(0, ...cost),
      avgActualCredits: avg(ok.map((c) => c.actualCredits)),
      avgEstimateCredits: avg(all.map((c) => c.estimateCredits)),
      overEstimate: ok.filter((c) => c.actualCredits > c.estimateCredits).length,
    };
  });

  const saved = generations.filter((g) => g.outcome === "saved");
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    pricingConfigVersion: pricing.version,
    markupMultiplier: pricing.markupMultiplier,
    creditValueInr: pricing.creditValueInr,
    actions,
    grounding: {
      pairs: generations.length,
      saved: saved.length,
      rejected: generations.filter((g) => g.outcome === "rejected").length,
      errors: generations.filter((g) => g.outcome === "error").length,
      retried: saved.filter((g) => g.attempts === 2).length,
      violationsInSaved: saved.reduce((n, g) => n + g.savedViolations, 0),
      injectedPairs: generations.filter((g) => g.injected).length,
      injectedSavedWithViolations: saved.filter((g) => g.injected && g.savedViolations > 0).length,
    },
    generations,
    calls,
  };
}

/** Human-readable summary (also written next to the JSON report). */
export function formatReport(r: EvalReport): string {
  const inr = (n: number) => `₹${n.toFixed(3)}`;
  const g = r.grounding;
  const rows = r.actions.map(
    (a) =>
      `| ${a.action} | ${a.model} | ${a.calls} | ${a.failed} | ${a.avgInputTokens} | ${a.avgOutputTokens} | ${inr(a.avgCostInr)} | ${inr(a.p95CostInr)} | ${a.avgActualCredits.toFixed(1)} | ${a.avgEstimateCredits.toFixed(1)} | ${a.overEstimate} |`,
  );
  const bad = r.generations.filter((x) => x.savedViolations > 0 || x.outcome === "error");
  return [
    `# Eval report — ${r.finishedAt}`,
    ``,
    `Pricing v${r.pricingConfigVersion} · markup ${r.markupMultiplier}× · ₹${r.creditValueInr}/credit`,
    ``,
    `## Grounding`,
    ``,
    `- Pairs: ${g.pairs} (${g.injectedPairs} injected)`,
    `- Saved: ${g.saved} · rejected by grounding: ${g.rejected} · errors: ${g.errors} · needed a retry: ${g.retried}`,
    `- **Violations in saved results: ${g.violationsInSaved}** (must be 0)`,
    `- Injected pairs saved with violations: ${g.injectedSavedWithViolations}`,
    ``,
    `## Cost per action`,
    ``,
    `| Action | Model | Calls | Failed | Avg in tok | Avg out tok | Avg cost | p95 cost | Avg credits | Avg estimate | Over estimate |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...rows,
    ``,
    `"Over estimate" counts calls whose real cost exceeded the estimate shown to the user; the app caps the capture at the hold, so these are revenue lost, not overcharges.`,
    ...(bad.length ? [``, `## Problem pairs`, ``, ...bad.map((x) => `- ${x.pair}${x.injected ? " (injected)" : ""}: ${x.outcome}${x.detail ? ` — ${x.detail}` : ""}`)] : []),
    ``,
  ].join("\n");
}
