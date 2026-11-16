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
  RetryExtractionError,
  ReviewError,
  JdNotFoundError,
  createJobDescription,
  getJobDescription,
  listJobDescriptions,
  reviseJobDescription,
  getGenerationReadiness,
  saveOriginalReview,
  reviewFlaggedReferral,
  updateCoupon,
  getActivePricingConfig,
  getOriginalVersion,
  getResumeFileKeys,
  getWalletPage,
  getWalletSummary,
  listPricingConfigs,
  listResumes,
  markExtractionForRetry,
} from "@resume-pilot/services";
import {
  createCouponInputSchema,
  jdInputSchema,
  reviseJdInputSchema,
  createPricingConfigVersionInputSchema,
  redeemCodeInputSchema,
  reviewReferralInputSchema,
  updateCouponInputSchema,
  pingInputSchema,
  walletHistoryInputSchema,
} from "@resume-pilot/validators";
import { enqueueExtraction, enqueueStructuring, getExtractionQueue } from "@resume-pilot/queue";
import { getStorage } from "@resume-pilot/storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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
  if (
    err instanceof CouponError ||
    err instanceof ReferralReviewError ||
    err instanceof RetryExtractionError
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
  }
  if (err instanceof JdNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message, cause: err });
  }
  if (err instanceof ReviewError) {
    throw new TRPCError({
      code: err.code === "not_found" ? "NOT_FOUND" : "BAD_REQUEST",
      message: err.message,
      cause: err,
    });
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

  /** The caller's own uploads — prd.md §5. */
  resumes: router({
    list: authProcedure.query(({ ctx }) => listResumes(ctx.db, ctx.user.id)),
    /**
     * 5-minute signed URLs for a resume's original files. Ownership is
     * checked here (NOT_FOUND for anyone else's resume, so ids can't be
     * probed) and again inside the storage wrapper.
     */
    fileUrls: authProcedure
      .input(z.object({ resumeId: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const files = await getResumeFileKeys(ctx.db, {
          userId: ctx.user.id,
          resumeId: input.resumeId,
        });
        if (!files) throw new TRPCError({ code: "NOT_FOUND" });
        const storage = getStorage();
        return files.map((f) => ({
          pageIndex: f.pageIndex,
          mimeType: f.mimeType,
          url: storage.getSignedUrl({ userId: ctx.user.id, storageKey: f.storageKey }),
        }));
      }),
    /** Retry a failed extraction (prd.md §5.3). Free; never touches the wallet. */
    retryExtraction: authProcedure
      .input(z.object({ resumeId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { step } = await markExtractionForRetry(ctx.db, {
          userId: ctx.user.id,
          resumeId: input.resumeId,
        }).catch(toTRPCError);
        const enqueue = step === "structure" ? enqueueStructuring : enqueueExtraction;
        await enqueue(getExtractionQueue(), { resumeId: input.resumeId });
        return { status: step === "structure" ? ("processed" as const) : ("uploaded" as const) };
      }),
    /** The parsed original version with its review flags, once status is `ready`. */
    original: authProcedure
      .input(z.object({ resumeId: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const version = await getOriginalVersion(ctx.db, {
          userId: ctx.user.id,
          resumeId: input.resumeId,
        });
        if (!version) throw new TRPCError({ code: "NOT_FOUND" });
        return version;
      }),
    /**
     * Save the review screen (prd.md §5.3 step 7, §8.6): edited content
     * plus the flagged fields the user confirmed as-is. Edits are the
     * user's own claims; content is validated against schema 2.0.
     */
    saveReview: authProcedure
      .input(
        z.object({
          resumeId: z.uuid(),
          content: z.unknown(),
          reviewedPaths: z.array(z.string().max(200)).max(500).default([]),
        }),
      )
      .mutation(({ ctx, input }) =>
        saveOriginalReview(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError),
      ),
    /** Whether Generate is unlocked: every `low` field reviewed. */
    readiness: authProcedure
      .input(z.object({ resumeId: z.uuid() }))
      .query(({ ctx, input }) =>
        getGenerationReadiness(ctx.db, { userId: ctx.user.id, resumeId: input.resumeId }).catch(
          toTRPCError,
        ),
      ),
  }),

  /** Saved job descriptions — prd.md §7.1. Saving is free; the 200–30,000 limit is enforced here and in the DB. */
  jds: router({
    list: authProcedure.query(({ ctx }) => listJobDescriptions(ctx.db, ctx.user.id)),
    get: authProcedure
      .input(z.object({ jdId: z.uuid() }))
      .query(({ ctx, input }) =>
        getJobDescription(ctx.db, { userId: ctx.user.id, jdId: input.jdId }).catch(toTRPCError),
      ),
    create: authProcedure
      .input(jdInputSchema)
      .mutation(({ ctx, input }) => createJobDescription(ctx.db, ctx.user.id, input)),
    /** Editing saves a new JD; the old one keeps backing whatever was built from it. */
    revise: authProcedure
      .input(reviseJdInputSchema)
      .mutation(({ ctx, input }) =>
        reviseJobDescription(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError),
      ),
  }),

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
