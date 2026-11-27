import { auth } from "@clerk/nextjs/server";
import { appRouter, createContext } from "@resume-pilot/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getDb } from "@/server/db";
import { clientIp, limitByIp } from "@/server/rate-limit";

async function handler(req: Request) {
  const { userId } = await auth();
  // Signed-in calls are limited per user where it matters (AI actions, uploads);
  // anonymous calls are limited per IP (prd.md §15).
  if (!userId) {
    const limited = await limitByIp(req, "trpcPublic");
    if (limited) return limited;
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
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
