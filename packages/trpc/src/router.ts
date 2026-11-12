import { estimateStub } from "@resume-pilot/credits";
import { pingInputSchema } from "@resume-pilot/validators";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),

  ping: publicProcedure.input(pingInputSchema).query(({ input }) => ({
    echo: input.message,
    estimate: estimateStub("ping"),
  })),
});

export type AppRouter = typeof appRouter;
