import type { ModelPrice, PricingConfigInput } from "@resume-pilot/validators";

/**
 * Credit calculation — prd.md §3.3:
 *
 *   credits = max(minimum, ceil((AI cost in INR × markup) / credit value))
 *
 * Pure: takes the pricing config as an argument, never reads it, so the
 * caller decides which version applies and records it on the `ai_jobs`
 * row. Nothing here is hardcoded — markup, FX rate, model prices,
 * minimum and credit value all come from `pricing_config`.
 */

/** A pricing_config row with numeric columns already parsed. */
export interface PricingConfig extends PricingConfigInput {
  version: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Subset of `inputTokens` served from OpenAI's prompt cache. */
  cachedInputTokens?: number;
}

export interface CreditCalculation {
  credits: number;
  /** AI cost before markup, in INR (unrounded). */
  costInr: number;
  /** AI cost before markup, rounded up to whole paise for `ai_jobs.cost_paise`. */
  costPaise: number;
  pricingConfigVersion: number;
}

export class UnknownModelError extends Error {
  constructor(
    readonly model: string,
    readonly pricingConfigVersion: number,
  ) {
    super(`No price for model "${model}" in pricing_config v${pricingConfigVersion}`);
    this.name = "UnknownModelError";
  }
}

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Float division like 0.3 / 0.1 gives 2.9999999999999996, and ceil of a
 * value that should be an exact integer would overcharge by one credit.
 * Snapping to 6 decimal places first removes that noise; any real
 * fractional credit is far larger than 1e-6.
 */
function ceilSnapped(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

function assertTokenCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

export function getModelPrice(config: PricingConfig, model: string): ModelPrice {
  const price = config.modelPrices[model];
  if (!price) throw new UnknownModelError(model, config.version);
  return price;
}

/** AI cost in INR for a given usage — input + cached input + output, converted at the config FX rate. */
export function aiCostInr(config: PricingConfig, model: string, usage: TokenUsage): number {
  const cached = usage.cachedInputTokens ?? 0;
  assertTokenCount("inputTokens", usage.inputTokens);
  assertTokenCount("outputTokens", usage.outputTokens);
  assertTokenCount("cachedInputTokens", cached);
  if (cached > usage.inputTokens) {
    throw new RangeError("cachedInputTokens cannot exceed inputTokens");
  }

  const price = getModelPrice(config, model);
  const cachedPrice = price.cachedInputPerMillionUsd ?? price.inputPerMillionUsd;
  const usd =
    ((usage.inputTokens - cached) * price.inputPerMillionUsd +
      cached * cachedPrice +
      usage.outputTokens * price.outputPerMillionUsd) /
    TOKENS_PER_MILLION;
  return usd * config.usdToInrRate;
}

/** Converts an INR AI cost into credits under the given config (markup, credit value, minimum). */
export function creditsForCostInr(config: PricingConfig, costInr: number): number {
  if (!Number.isFinite(costInr) || costInr < 0) {
    throw new RangeError(`costInr must be a non-negative finite number, got ${costInr}`);
  }
  const raw = ceilSnapped((costInr * config.markupMultiplier) / config.creditValueInr);
  return Math.max(config.minimumCreditsPerAction, raw);
}

/**
 * Full calculation for one AI call. Used both for the estimate (with
 * the max output budget as `outputTokens`) and the capture (with actual
 * usage) — so the same formula and the same config version back both.
 */
export function calculateCredits(
  config: PricingConfig,
  model: string,
  usage: TokenUsage,
): CreditCalculation {
  const costInr = aiCostInr(config, model, usage);
  return {
    credits: creditsForCostInr(config, costInr),
    costInr,
    costPaise: ceilSnapped(costInr * 100),
    pricingConfigVersion: config.version,
  };
}
