import { z } from "zod";

/**
 * Pricing config shapes — prd.md §3.3. Shared by the credits calculator
 * (parsing DB rows) and the admin tRPC procedures (parsing input).
 */

/** Per-model OpenAI prices in USD per 1M tokens. */
export const modelPriceSchema = z.object({
  inputPerMillionUsd: z.number().nonnegative(),
  outputPerMillionUsd: z.number().nonnegative(),
  /** Cached-input price; falls back to the input price when absent. */
  cachedInputPerMillionUsd: z.number().nonnegative().optional(),
});

export const modelPricesSchema = z
  .record(z.string().min(1).max(100), modelPriceSchema)
  .refine((prices) => Object.keys(prices).length > 0, {
    message: "At least one model price is required",
  });

/** What an admin submits to create a new pricing config version. */
export const pricingConfigInputSchema = z.object({
  modelPrices: modelPricesSchema,
  usdToInrRate: z.number().positive().max(10_000),
  markupMultiplier: z.number().positive().max(1_000),
  minimumCreditsPerAction: z.number().int().nonnegative().max(1_000_000),
  creditValueInr: z.number().positive().max(1_000),
});

/** Admin changes always carry a reason for the audit log (prd.md §2.2). */
export const createPricingConfigVersionInputSchema = z.object({
  config: pricingConfigInputSchema,
  reason: z.string().trim().min(3).max(500),
});

export type ModelPrice = z.infer<typeof modelPriceSchema>;
export type ModelPrices = z.infer<typeof modelPricesSchema>;
export type PricingConfigInput = z.infer<typeof pricingConfigInputSchema>;
export type CreatePricingConfigVersionInput = z.infer<typeof createPricingConfigVersionInputSchema>;
