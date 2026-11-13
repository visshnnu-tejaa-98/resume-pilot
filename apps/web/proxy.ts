import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * `clerkMiddleware` just populates `auth()` for every request — it does
 * NOT gate routes here. Clerk's own current guidance (and
 * `createRouteMatcher` + `auth.protect()` is now deprecated for this
 * reason) is resource-based checks: each protected page/route calls
 * `auth()` itself and redirects/throws if there's no session — see
 * `app/dashboard/page.tsx` and `authProcedure` in
 * packages/trpc/src/trpc.ts. Path-matching here could silently diverge
 * from how Next.js actually resolves a route and leave something
 * unintentionally unprotected; per-resource checks can't.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
