import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Placeholder guard. Real Clerk-backed auth lands in
 * tasks/todo/m1-foundation/04-auth-clerk-integration.md — every
 * procedure must resolve the user server-side per prd.md §4.3.
 */
export const authProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const adminProcedure = authProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
