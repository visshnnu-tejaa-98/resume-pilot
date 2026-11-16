import { estimateStub } from "@resume-pilot/credits";
import {
  CodeRedemptionError,
  CouponError,
  createCoupon,
  createPricingConfigVersion,
  listCoupons,
  listFlaggedReferrals,
  redeemCode,
  ReferralReviewError,
  reviewFlaggedReferral,
  updateCoupon,
  getActivePricingConfig,
  getWalletPage,
  getWalletSummary,
  listPricingConfigs,
} from "@resume-pilot/services";
import {
  createCouponInputSchema,
  createPricingConfigVersionInputSchema,
  redeemCodeInputSchema,
  reviewReferralInputSchema,
  updateCouponInputSchema,
  pingInputSchema,
  walletHistoryInputSchema,
} from "@resume-pilot/validators";
import { TRPCError } from "@trpc/server";
import { adminProcedure, authProcedure, publicProcedure, router } from "./trpc";

/**
 * Admin-only pricing settings — prd.md §3.3, §16.4. Changing markup,
 * FX rate, minimums or model prices creates a new version; nothing is
 * edited in place and no deploy is needed.
 */
/** Turns domain errors into client-safe tRPC errors with the user-facing message. */
function toTRPCError(err: unknown): never {
  if (err instanceof CodeRedemptionError) {
    throw new TRPCError({
      code: err.reason === "rate_limited" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof CouponError || err instanceof ReferralReviewError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
  }
  throw err;
}

/** Coupons and the flagged-referral review queue — prd.md §2.1, §2.2. */
const adminCodesRouter = router({
  listCoupons: adminProcedure.query(({ ctx }) => listCoupons(ctx.db)),
  createCoupon: adminProcedure
    .input(createCouponInputSchema)
    .mutation(({ ctx, input }) => createCoupon(ctx.db, ctx.user.id, input).catch(toTRPCError)),
  updateCoupon: adminProcedure.input(updateCouponInputSchema).mutation(({ ctx, input }) => {
    const { couponId, ...changes } = input;
    return updateCoupon(ctx.db, ctx.user.id, couponId, changes).catch(toTRPCError);
  }),
  flaggedReferrals: adminProcedure.query(({ ctx }) => listFlaggedReferrals(ctx.db)),
  reviewReferral: adminProcedure
    .input(reviewReferralInputSchema)
    .mutation(({ ctx, input }) =>
      reviewFlaggedReferral(ctx.db, { adminUserId: ctx.user.id, ...input }).catch(toTRPCError),
    ),
});

const adminPricingRouter = router({
  active: adminProcedure.query(({ ctx }) => getActivePricingConfig(ctx.db)),
  list: adminProcedure.query(({ ctx }) => listPricingConfigs(ctx.db)),
  createVersion: adminProcedure
    .input(createPricingConfigVersionInputSchema)
    .mutation(({ ctx, input }) => createPricingConfigVersion(ctx.db, ctx.user.id, input)),
});

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),

  ping: publicProcedure.input(pingInputSchema).query(({ input }) => ({
    echo: input.message,
    estimate: estimateStub("ping"),
  })),

  me: authProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
  })),

  /** Backs the Dashboard's wallet balance + referral code (prd.md §4.1, §12.1). */
  wallet: authProcedure.query(({ ctx }) => getWalletSummary(ctx.db, ctx.user.id)),

  /** Wallet page: balance, active holds, ledger history — prd.md §3.5. Always the caller's own wallet. */
  walletHistory: authProcedure
    .input(walletHistoryInputSchema)
    .query(({ ctx, input }) => getWalletPage(ctx.db, ctx.user.id, input)),

  /** Apply a coupon or referral code to the caller's own wallet — prd.md §2.1. */
  redeemCode: authProcedure.input(redeemCodeInputSchema).mutation(({ ctx, input }) =>
    redeemCode(ctx.db, {
      userId: ctx.user.id,
      code: input.code,
      ip: ctx.clientIp,
      deviceId: ctx.deviceId,
    }).catch(toTRPCError),
  ),

  admin: router({
    pricing: adminPricingRouter,
    codes: adminCodesRouter,
  }),
});

export type AppRouter = typeof appRouter;
