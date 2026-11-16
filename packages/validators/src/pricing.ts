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

/** Paid AI actions (prd.md §3.2). Extraction is platform-paid and not here. */
export const paidActionSchema = z.enum(["jd_analysis", "generation", "ats_scoring"]);

export const actionSettingSchema = z.object({
  model: z.string().min(1).max(100),
  /** System prompt + schema tokens added on top of the user's input. */
  promptOverheadTokens: z.number().int().nonnegative().max(200_000),
  /** Estimate's output size and the AI call's max_output_tokens cap. */
  maxOutputTokens: z.number().int().positive().max(200_000),
});

export const actionSettingsSchema = z.object({
  jd_analysis: actionSettingSchema,
  generation: actionSettingSchema,
  ats_scoring: actionSettingSchema,
});

/** What an admin submits to create a new pricing config version. */
export const pricingConfigInputSchema = z
  .object({
    modelPrices: modelPricesSchema,
    actionSettings: actionSettingsSchema,
    usdToInrRate: z.number().positive().max(10_000),
    markupMultiplier: z.number().positive().max(1_000),
    minimumCreditsPerAction: z.number().int().nonnegative().max(1_000_000),
    creditValueInr: z.number().positive().max(1_000),
  })
  .refine((c) => Object.values(c.actionSettings).every((a) => a.model in c.modelPrices), {
    message: "Every action's model must have a price in modelPrices",
    path: ["actionSettings"],
  });

/** Admin changes always carry a reason for the audit log (prd.md §2.2). */
export const createPricingConfigVersionInputSchema = z.object({
  config: pricingConfigInputSchema,
  reason: z.string().trim().min(3).max(500),
});

export type ModelPrice = z.infer<typeof modelPriceSchema>;
export type ModelPrices = z.infer<typeof modelPricesSchema>;
export type PaidAction = z.infer<typeof paidActionSchema>;
export type ActionSetting = z.infer<typeof actionSettingSchema>;
export type ActionSettings = z.infer<typeof actionSettingsSchema>;
export type PricingConfigInput = z.infer<typeof pricingConfigInputSchema>;
export type CreatePricingConfigVersionInput = z.infer<typeof createPricingConfigVersionInputSchema>;
