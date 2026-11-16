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
