/**
 * tRPC request context. Clerk-backed `userId`/`role` land in
 * tasks/todo/m1-foundation/04-auth-clerk-integration.md; until then
 * every request is anonymous.
 */
export interface Context {
  userId: string | null;
  role: "user" | "admin" | null;
}

export function createContext(): Context {
  return { userId: null, role: null };
}
