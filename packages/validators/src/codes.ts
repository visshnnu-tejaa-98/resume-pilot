import { z } from "zod";

/** Applying a coupon or referral code — prd.md §2.1. */
export const redeemCodeInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export const createCouponInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, "3–32 letters, digits, - or _"),
  credits: z.number().int().positive().max(1_000_000),
  maxRedemptions: z.number().int().positive().nullish(),
  expiresAt: z.coerce.date().nullish(),
  active: z.boolean().optional(),
});

export const updateCouponInputSchema = z.object({
  couponId: z.uuid(),
  maxRedemptions: z.number().int().positive().nullish(),
  expiresAt: z.coerce.date().nullish(),
  active: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500),
});

export const reviewReferralInputSchema = z.object({
  redemptionId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(500),
});

export type RedeemCodeInputData = z.infer<typeof redeemCodeInputSchema>;
export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponInputSchema>;
export type ReviewReferralInput = z.infer<typeof reviewReferralInputSchema>;
