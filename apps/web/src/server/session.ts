import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getWalletSummary } from "@resume-pilot/services";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db";
import { ensureUserSynced } from "@/server/ensure-user";

/**
 * The signed-in user for app pages, resolved server-side from the Clerk
 * session (never from client input). Wrapped in React `cache` so the
 * layout and the page share one lookup per request. Redirects to
 * /sign-in when there is no session.
 */
export const requireAppUser = cache(async () => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) redirect("/sign-in");
  const [user, clerkUser] = await Promise.all([ensureUserSynced(clerkUserId), currentUser()]);
  return {
    user,
    clerkUserId,
    firstName: clerkUser?.firstName?.trim() || null,
    fullName: clerkUser?.fullName?.trim() || null,
    imageUrl: clerkUser?.imageUrl ?? null,
  };
});

export const getAppWallet = cache(async (userId: string) => getWalletSummary(getDb(), userId));
