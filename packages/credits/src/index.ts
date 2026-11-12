/**
 * Placeholder for the real estimate -> hold -> capture flow
 * (tasks/todo/m2-credits/02-estimate-hold-capture.md). Exists at this
 * stage only to prove cross-package workspace wiring (consumed by
 * @resume-pilot/trpc).
 */
export interface EstimateStub {
  action: string;
  estimatedCredits: number;
}

export function estimateStub(action: string): EstimateStub {
  return { action, estimatedCredits: 0 };
}
