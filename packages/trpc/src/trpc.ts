import { getUserByClerkId, type UserProfile } from "@resume-pilot/services";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export interface AuthedContext extends Context {
  user: UserProfile;
}

/**
 * Resolves the user server-side on every call — prd.md §4.3. Role is
 * read fresh from the DB here, not trusted from anywhere else, so it
 * can never be spoofed by a client and can never go stale within a
 * long-lived session.
 */
export const authProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = await getUserByClerkId(ctx.db, ctx.userId);
  if (!user || user.status === "suspended") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user } satisfies AuthedContext });
});

export const adminProcedure = authProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
