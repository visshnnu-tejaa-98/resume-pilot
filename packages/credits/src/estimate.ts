import type { PaidAction } from "@resume-pilot/validators";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { calculateCredits, type PricingConfig } from "./pricing";

/**
 * Credit estimate for one paid AI action — prd.md §3.4 step 1: input
 * size counted with the model's tokenizer (o200k, used by current
 * OpenAI models) plus the action's fixed prompt overhead, and the full
 * output budget. The AI call must pass `maxOutputTokens` as its
 * max_output_tokens cap, so the actual cost can't exceed the estimate's
 * output side; any input-side drift is absorbed by capture charging
 * `min(actual, estimate)`.
 */

export interface CreditEstimate {
  action: PaidAction;
  credits: number;
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  pricingConfigVersion: number;
}

/** Token count of the user-supplied text that goes into the prompt (resume JSON, JD text). */
export function countInputTokens(parts: readonly string[]): number {
  return parts.reduce((sum, part) => sum + countTokens(part), 0);
}

export function estimateCredits(
  config: PricingConfig,
  action: PaidAction,
  inputParts: readonly string[],
): CreditEstimate {
  const setting = config.actionSettings[action];
  const inputTokens = countInputTokens(inputParts) + setting.promptOverheadTokens;
  const { credits } = calculateCredits(config, setting.model, {
    inputTokens,
    outputTokens: setting.maxOutputTokens,
  });
  return {
    action,
    credits,
    model: setting.model,
    inputTokens,
    maxOutputTokens: setting.maxOutputTokens,
    pricingConfigVersion: config.version,
  };
}
