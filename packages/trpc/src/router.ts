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
import { enqueueExtraction, enqueueGeneration, enqueueScoring, enqueueJdAnalysis, enqueueStructuring, getAiQueue, getExtractionQueue } from "@resume-pilot/queue";
import { getStorage } from "@resume-pilot/storage";
import { SCORING_METHOD_VERSION } from "@resume-pilot/ai";
import {
  currentReport,
  estimateCompare,
  estimateScoring,
  getReport,
  getScoringStatus,
  listVersionReports,
  ScoringError,
  startCompare,
  startScoring,
  type StartScoringResult,
  deleteVersion,
  setVersionTemplate,
  duplicateVersion,
  estimateGeneration,
  GenerationError,
  getGenerationStatus,
  getVersion,
  listDeletedVersions,
  listVersions,
  restoreVersion,
  saveVersionContent,
  startGeneration,
  VersionError,
  estimateJdAnalysis,
  getJdAnalysisStatus,
  InsufficientCreditsError,
  JdAnalysisEstimateChangedError,
  releaseHold,
  startJdAnalysis,
  adminAdjustCredits,
  adminSetEmailTemplateEnabled,
  adminSetResumeTemplateActive,
  adminSetUserStatus,
  NegativeBalanceError,
} from "@resume-pilot/services";
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
  if (err instanceof InsufficientCreditsError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Not enough credits. Add money to your wallet to continue.", cause: err });
  }
  if (err instanceof GenerationError) {
    const code = err.code === "not_found" ? "NOT_FOUND" : err.code === "not_ready" ? "PRECONDITION_FAILED" : "CONFLICT";
    throw new TRPCError({ code, message: err.message, cause: err });
  }
  if (err instanceof ScoringError) {
    throw new TRPCError({ code: err.code === "not_found" ? "NOT_FOUND" : "CONFLICT", message: err.message, cause: err });
  }
  if (err instanceof VersionError) {
    throw new TRPCError({ code: err.code === "not_found" ? "NOT_FOUND" : "BAD_REQUEST", message: err.message, cause: err });
  }
  if (err instanceof JdAnalysisEstimateChangedError) {
    throw new TRPCError({ code: "CONFLICT", message: err.message, cause: err });
  }
  // Admin service guards (missing reason, unknown target, self-suspend) and ledger floor.
  if (err instanceof RangeError || err instanceof NegativeBalanceError) {
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

const reason = z.string().trim().min(3).max(500);

/** Audited admin writes on users, email and resume templates — prd.md §2.2. */
const adminUsersRouter = router({
  setStatus: adminProcedure
    .input(z.object({ userId: z.uuid(), status: z.enum(["active", "suspended"]), reason }))
    .mutation(({ ctx, input }) => adminSetUserStatus(ctx.db, { adminUserId: ctx.user.id, ...input }).catch(toTRPCError)),
  adjustCredits: adminProcedure
    .input(
      z.object({
        userId: z.uuid(),
        credits: z.number().int().refine((n) => n !== 0, "Enter a non-zero amount").refine((n) => Math.abs(n) <= 1_000_000, "Too large"),
        reason,
      }),
    )
    .mutation(({ ctx, input }) => adminAdjustCredits(ctx.db, { adminUserId: ctx.user.id, ...input }).catch(toTRPCError)),
});

const adminContentRouter = router({
  setEmailTemplateEnabled: adminProcedure
    .input(z.object({ templateKey: z.string().min(1).max(100), enabled: z.boolean(), reason }))
    .mutation(({ ctx, input }) => adminSetEmailTemplateEnabled(ctx.db, { adminUserId: ctx.user.id, ...input }).catch(toTRPCError)),
  setResumeTemplateActive: adminProcedure
    .input(z.object({ templateId: z.uuid(), active: z.boolean(), reason }))
    .mutation(({ ctx, input }) => adminSetResumeTemplateActive(ctx.db, { adminUserId: ctx.user.id, ...input }).catch(toTRPCError)),
});

const adminPricingRouter = router({
  active: adminProcedure.query(({ ctx }) => getActivePricingConfig(ctx.db)),
  list: adminProcedure.query(({ ctx }) => listPricingConfigs(ctx.db)),
  createVersion: adminProcedure
    .input(createPricingConfigVersionInputSchema)
    .mutation(({ ctx, input }) => createPricingConfigVersion(ctx.db, ctx.user.id, input)),
});

/** Queues a started scoring run; on failure releases its holds so nothing is charged. */
async function queueScoring(db: Parameters<typeof releaseHold>[0], r: StartScoringResult) {
  if (r.status !== "running") return;
  try {
    await enqueueScoring(getAiQueue(), { aiJobId: r.aiJobId });
  } catch (err) {
    if (r.created) await releaseHold(db, { aiJobId: r.aiJobId, reason: "could not queue the scoring" });
    if (r.analysisCreated && r.analysisAiJobId) await releaseHold(db, { aiJobId: r.analysisAiJobId, reason: "could not queue the scoring" });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't start scoring. You weren't charged; please try again.", cause: err });
  }
}

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

    /** JD analysis (prd.md §7.2): cached result, run in progress, or last failure. Free. */
    analysis: authProcedure
      .input(z.object({ jdId: z.uuid() }))
      .query(({ ctx, input }) => getJdAnalysisStatus(ctx.db, { userId: ctx.user.id, jdId: input.jdId }).catch(toTRPCError)),

    /** Step 1 of estimate → hold → capture. `cached` = already analysed, nothing to pay. */
    estimateAnalysis: authProcedure
      .input(z.object({ jdId: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const r = await estimateJdAnalysis(ctx.db, { userId: ctx.user.id, jdId: input.jdId }).catch(toTRPCError);
        return r.cached ? { cached: true as const } : { cached: false as const, credits: r.estimate.credits };
      }),

    /**
     * Step 3: the user confirmed `confirmedCredits`. Places (or reuses) the
     * hold and queues the run. Never holds more than the confirmed amount;
     * an analysed JD returns `cached` without charging.
     */
    analyze: authProcedure
      .input(z.object({ jdId: z.uuid(), confirmedCredits: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const r = await startJdAnalysis(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError);
        if (r.status === "cached") return r;
        try {
          // Idempotent per aiJobId, so re-enqueueing an in-flight run is harmless.
          await enqueueJdAnalysis(getAiQueue(), { aiJobId: r.aiJobId, jdId: input.jdId });
        } catch (err) {
          if (r.created) await releaseHold(ctx.db, { aiJobId: r.aiJobId, reason: "could not queue the analysis" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't start the analysis. You weren't charged; please try again.", cause: err });
        }
        return r;
      }),
  }),

  /** Tailored resume generation — prd.md §8.1, estimate → hold → capture §3.4. */
  generation: router({
    /** What will run (JD analysis if needed + generation) and the most it can cost. Read-only. */
    estimate: authProcedure
      .input(z.object({ sourceVersionId: z.uuid(), jdId: z.uuid() }))
      .query(({ ctx, input }) => estimateGeneration(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    /**
     * Confirm: places the hold(s) and queues the run. `requestId` is made once
     * per confirmation dialog, so double submits map to the same job.
     */
    start: authProcedure
      .input(z.object({ sourceVersionId: z.uuid(), jdId: z.uuid(), confirmedCredits: z.number().int().positive(), requestId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const r = await startGeneration(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError);
        try {
          await enqueueGeneration(getAiQueue(), { aiJobId: r.aiJobId });
        } catch (err) {
          if (r.created) await releaseHold(ctx.db, { aiJobId: r.aiJobId, reason: "could not queue the generation" });
          if (r.analysisCreated && r.analysisAiJobId) await releaseHold(ctx.db, { aiJobId: r.analysisAiJobId, reason: "could not queue the generation" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't start tailoring. You weren't charged; please try again.", cause: err });
        }
        return { aiJobId: r.aiJobId };
      }),
    status: authProcedure.input(z.object({ aiJobId: z.uuid() })).query(async ({ ctx, input }) => {
      const s = await getGenerationStatus(ctx.db, { userId: ctx.user.id, aiJobId: input.aiJobId });
      if (!s) throw new TRPCError({ code: "NOT_FOUND" });
      return s;
    }),
  }),

  /** ATS scoring — prd.md §9. Cached content + JD is free (16.2.6). */
  scoring: router({
    estimate: authProcedure
      .input(z.object({ versionId: z.uuid(), jdId: z.uuid() }))
      .query(({ ctx, input }) => estimateScoring(ctx.db, { userId: ctx.user.id, ...input, methodVersion: SCORING_METHOD_VERSION }).catch(toTRPCError)),
    /** Confirm. A cache hit returns the report and charges nothing. */
    start: authProcedure
      .input(z.object({ versionId: z.uuid(), jdId: z.uuid(), confirmedCredits: z.number().int().nonnegative(), requestId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const r = await startScoring(ctx.db, { userId: ctx.user.id, ...input, methodVersion: SCORING_METHOD_VERSION }).catch(toTRPCError);
        await queueScoring(ctx.db, r);
        return r.status === "cached" ? { status: "cached" as const, reportId: r.reportId } : { status: "running" as const, aiJobId: r.aiJobId };
      }),
    status: authProcedure.input(z.object({ aiJobId: z.uuid() })).query(async ({ ctx, input }) => {
      const s = await getScoringStatus(ctx.db, { userId: ctx.user.id, aiJobId: input.aiJobId });
      if (!s) throw new TRPCError({ code: "NOT_FOUND" });
      return s;
    }),
  }),

  reports: router({
    get: authProcedure.input(z.object({ reportId: z.uuid() })).query(async ({ ctx, input }) => {
      const r = await getReport(ctx.db, { userId: ctx.user.id, reportId: input.reportId });
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      return r;
    }),
    /** Score history for a version (§9.3). */
    history: authProcedure
      .input(z.object({ versionId: z.uuid(), jdId: z.uuid().optional() }))
      .query(({ ctx, input }) => listVersionReports(ctx.db, { userId: ctx.user.id, ...input })),
    current: authProcedure
      .input(z.object({ versionId: z.uuid(), jdId: z.uuid() }))
      .query(({ ctx, input }) => currentReport(ctx.db, { userId: ctx.user.id, ...input, methodVersion: SCORING_METHOD_VERSION }).catch(toTRPCError)),
  }),

  /** Original vs tailored (§9.4): only sides without a current report cost anything. */
  compare: router({
    estimate: authProcedure
      .input(z.object({ aVersionId: z.uuid(), bVersionId: z.uuid(), jdId: z.uuid() }))
      .query(({ ctx, input }) => estimateCompare(ctx.db, { userId: ctx.user.id, ...input, methodVersion: SCORING_METHOD_VERSION }).catch(toTRPCError)),
    start: authProcedure
      .input(z.object({ aVersionId: z.uuid(), bVersionId: z.uuid(), jdId: z.uuid(), confirmedCredits: z.number().int().nonnegative(), requestId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const r = await startCompare(ctx.db, { userId: ctx.user.id, ...input, methodVersion: SCORING_METHOD_VERSION }).catch(toTRPCError);
        await queueScoring(ctx.db, r.a);
        await queueScoring(ctx.db, r.b);
        const view = (x: StartScoringResult) => (x.status === "cached" ? { status: "cached" as const, reportId: x.reportId } : { status: "running" as const, aiJobId: x.aiJobId });
        return { a: view(r.a), b: view(r.b) };
      }),
  }),

  /** Resume versions — prd.md §8.5, §8.6. Always the caller's own. */
  versions: router({
    list: authProcedure.query(({ ctx }) => listVersions(ctx.db, ctx.user.id)),
    deleted: authProcedure.query(({ ctx }) => listDeletedVersions(ctx.db, ctx.user.id)),
    get: authProcedure.input(z.object({ versionId: z.uuid() })).query(({ ctx, input }) => getVersion(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    /** Hand edits are the user's own claims (§8.6); marks cached ATS scores outdated. */
    save: authProcedure
      .input(z.object({ versionId: z.uuid(), content: z.unknown(), template: z.string().max(40).optional() }))
      .mutation(({ ctx, input }) => saveVersionContent(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    /** Template choice only (also for the original, which isn't edited here). */
    setTemplate: authProcedure
      .input(z.object({ versionId: z.uuid(), template: z.string().max(40) }))
      .mutation(({ ctx, input }) => setVersionTemplate(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    /** No AI call, no charge. */
    duplicate: authProcedure.input(z.object({ versionId: z.uuid() })).mutation(({ ctx, input }) => duplicateVersion(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    delete: authProcedure.input(z.object({ versionId: z.uuid() })).mutation(({ ctx, input }) => deleteVersion(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
    restore: authProcedure.input(z.object({ versionId: z.uuid() })).mutation(({ ctx, input }) => restoreVersion(ctx.db, { userId: ctx.user.id, ...input }).catch(toTRPCError)),
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
    users: adminUsersRouter,
    content: adminContentRouter,
  }),
});

export type AppRouter = typeof appRouter;
