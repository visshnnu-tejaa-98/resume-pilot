import { estimateStub } from "@resume-pilot/credits";
import {
  createPricingConfigVersion,
  getActivePricingConfig,
  getWalletSummary,
  listPricingConfigs,
} from "@resume-pilot/services";
import { createPricingConfigVersionInputSchema, pingInputSchema } from "@resume-pilot/validators";
import { adminProcedure, authProcedure, publicProcedure, router } from "./trpc";

/**
 * Admin-only pricing settings — prd.md §3.3, §16.4. Changing markup,
 * FX rate, minimums or model prices creates a new version; nothing is
 * edited in place and no deploy is needed.
 */
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

  admin: router({
    pricing: adminPricingRouter,
  }),
});

export type AppRouter = typeof appRouter;
