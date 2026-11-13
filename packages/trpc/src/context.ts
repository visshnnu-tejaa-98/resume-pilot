import type { Database } from "@resume-pilot/database";

/**
 * tRPC request context. `userId` is Clerk's verified session user id
 * (from `auth()` server-side, never anything client-supplied) — see
 * tasks/todo/m1-foundation/04-auth-clerk-integration.md. There is
 * deliberately no `role` field here: `authProcedure`/`adminProcedure`
 * always resolve role fresh from the DB inside the procedure (see
 * trpc.ts), never from anything passed into the context, so there is
 * no stale or spoofable role to worry about — prd.md §4.3.
 */
export interface Context {
  db: Database;
  userId: string | null;
}

export function createContext(input: Context): Context {
  return input;
}
