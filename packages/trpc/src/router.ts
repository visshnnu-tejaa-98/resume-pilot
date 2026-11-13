import { estimateStub } from "@resume-pilot/credits";
import { getWalletSummary } from "@resume-pilot/services";
import { pingInputSchema } from "@resume-pilot/validators";
import { authProcedure, publicProcedure, router } from "./trpc";

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
});

export type AppRouter = typeof appRouter;
