import { auth } from "@clerk/nextjs/server";
import { appRouter, createContext } from "@resume-pilot/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getDb } from "@/server/db";

/**
 * First hop of X-Forwarded-For (Railway's edge proxy sets it), else
 * X-Real-IP. Used only for abuse signals, never for auth.
 */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const { userId } = await auth();
      return createContext({
        db: getDb(),
        userId,
        clientIp: clientIp(req),
        deviceId: req.headers.get("x-device-id")?.slice(0, 128) ?? null,
      });
    },
  });
}

export { handler as GET, handler as POST };
