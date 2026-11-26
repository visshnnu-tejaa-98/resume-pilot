import { readFileSync } from "node:fs";
import type { PricingConfig } from "@resume-pilot/credits";
import { pricingConfigInputSchema } from "@resume-pilot/validators";

/**
 * Pricing used to cost the eval. Defaults mirror the seeded config, with
 * provider prices for the models you're likely to compare — check them
 * against https://openai.com/api/pricing before relying on the numbers.
 *
 *   EVAL_PRICING_FILE  JSON pricing config (same shape as an admin pricing
 *                      version) to cost against instead of the defaults
 *   EVAL_MODEL         model for all three paid actions (default gpt-5.1)
 */
const DEFAULT: PricingConfig = {
  version: 0,
  modelPrices: {
    "gpt-5.1": { inputPerMillionUsd: 1.25, cachedInputPerMillionUsd: 0.125, outputPerMillionUsd: 10 },
    "gpt-5-mini": { inputPerMillionUsd: 0.25, cachedInputPerMillionUsd: 0.025, outputPerMillionUsd: 2 },
    "gpt-5-nano": { inputPerMillionUsd: 0.05, cachedInputPerMillionUsd: 0.005, outputPerMillionUsd: 0.4 },
  },
  actionSettings: {
    jd_analysis: { model: "gpt-5.1", maxOutputTokens: 3000, promptOverheadTokens: 1500 },
    generation: { model: "gpt-5.1", maxOutputTokens: 6000, promptOverheadTokens: 2500 },
    ats_scoring: { model: "gpt-5.1", maxOutputTokens: 5000, promptOverheadTokens: 2000 },
  },
  usdToInrRate: 83,
  markupMultiplier: 3,
  minimumCreditsPerAction: 50,
  creditValueInr: 0.05,
};

export function evalPricing(env: NodeJS.ProcessEnv = process.env): PricingConfig {
  let config: PricingConfig = DEFAULT;
  if (env.EVAL_PRICING_FILE) {
    const raw = JSON.parse(readFileSync(env.EVAL_PRICING_FILE, "utf8")) as Record<string, unknown>;
    config = { ...pricingConfigInputSchema.parse(raw), version: Number(raw.version ?? 0) };
  }
  const model = env.EVAL_MODEL;
  if (model) {
    if (!(model in config.modelPrices)) throw new Error(`EVAL_MODEL ${model} has no price in the pricing config`);
    const s = config.actionSettings;
    config = { ...config, actionSettings: { jd_analysis: { ...s.jd_analysis, model }, generation: { ...s.generation, model }, ats_scoring: { ...s.ats_scoring, model } } };
  }
  return config;
}
