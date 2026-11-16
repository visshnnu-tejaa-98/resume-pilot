import { enqueueTransactionalEmail } from "@resume-pilot/queue";
import { getTransactionalEmailQueue } from "@/server/queue";

/**
 * Queues the welcome email for a signed-up user (prd.md §13.1). Called
 * from every path that provisions a user, so every signup gets one:
 *
 * - the Clerk `user.created` webhook (production), and
 * - `ensureUserSynced`, the fallback that provisions on first dashboard
 *   load when the webhook can't reach this server (local dev).
 *
 * Safe to call more than once: the job id and
 * `email_messages.idempotency_key` (`welcome:<userId>`) make repeats
 * no-ops, so whichever path runs first wins and the other does nothing.
 */
export async function enqueueWelcomeEmail(userId: string, firstName: string | null): Promise<void> {
  await enqueueTransactionalEmail(getTransactionalEmailQueue(), {
    templateKey: "welcome",
    userId,
    firstName,
  });
}
