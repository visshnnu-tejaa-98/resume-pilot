import { clerkClient } from "@clerk/nextjs/server";
import {
  createUserFromClerkWebhook,
  getUserByClerkId,
  type UserProfile,
} from "@resume-pilot/services";
import { getDb } from "@/server/db";
import { enqueueWelcomeEmail } from "@/server/welcome";

/**
 * The `user.created` webhook (app/api/webhooks/clerk/route.ts) is the
 * primary provisioning path, but it needs a URL Clerk's servers can
 * reach — not guaranteed in local dev without a tunnel. This is the
 * fallback: on any authenticated request where the DB row doesn't
 * exist yet, fetch the user from Clerk's backend API and provision
 * them inline. Safe to call unconditionally — `createUserFromClerkWebhook`
 * is already idempotent, so this never races or double-creates
 * against a webhook delivery that lands later.
 */
export async function ensureUserSynced(clerkUserId: string): Promise<UserProfile> {
  const db = getDb();
  const existing = await getUserByClerkId(db, clerkUserId);
  if (existing) {
    return existing;
  }

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error(`Clerk user ${clerkUserId} has no email address`);
  }

  const result = await createUserFromClerkWebhook(db, { clerkUserId, email });

  // Same welcome email the webhook sends: without this, users
  // provisioned here (no webhook reachable) never got one. Failure is
  // logged, not thrown: the user is already created and must still
  // reach the dashboard. A later webhook delivery re-enqueues anyway.
  try {
    await enqueueWelcomeEmail(result.userId, clerkUser.firstName);
  } catch (err) {
    console.error("[ensure-user] failed to enqueue welcome email:", err);
  }

  const created = await getUserByClerkId(db, clerkUserId);
  if (!created) {
    throw new Error(`User ${clerkUserId} not found immediately after provisioning`);
  }
  return created;
}
