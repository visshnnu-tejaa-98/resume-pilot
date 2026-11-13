import { auth } from "@clerk/nextjs/server";
import { appRouter, createContext } from "@resume-pilot/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getDb } from "@/server/db";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const { userId } = await auth();
      return createContext({ db: getDb(), userId });
    },
  });
}

export { handler as GET, handler as POST };
