export {
  aiCostInr,
  calculateCredits,
  creditsForCostInr,
  getModelPrice,
  UnknownModelError,
  type CreditCalculation,
  type PricingConfig,
  type TokenUsage,
} from "./pricing";
export { countInputTokens, estimateCredits, type CreditEstimate } from "./estimate";

/**
 * Credits each side gets for a referral (prd.md v2.2 §2.1: 100 to the
 * referrer, 100 to the new user). Decided, not an open §16.4 value —
 * move into config if that ever changes.
 */
export const REFERRAL_REWARD_CREDITS = 100;

/**
 * Placeholder for the real estimate -> hold -> capture flow
 * (tasks/todo/m2-credits/02-estimate-hold-capture.md). Still consumed by
 * the `ping` procedure in @resume-pilot/trpc to prove workspace wiring.
 */
export interface EstimateStub {
  action: string;
  estimatedCredits: number;
}

export function estimateStub(action: string): EstimateStub {
  return { action, estimatedCredits: 0 };
}
