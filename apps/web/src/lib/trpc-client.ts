import type { AppRouter } from "@resume-pilot/trpc";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";

/** Browser tRPC client. The server resolves the user from the Clerk session. */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

/** User-facing message from a failed tRPC call. */
export function trpcErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof TRPCClientError && err.message) return err.message;
  return fallback;
}
