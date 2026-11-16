import { clerkClient } from "@clerk/nextjs/server";
import { CodeRedemptionError, hasRedeemedCode, redeemCode } from "@resume-pilot/services";
import { getDb } from "@/server/db";

export type SignupCodeOutcome =
  | { status: "none" }
  | { status: "applied"; credits: number }
  | { status: "rejected"; message: string };

/**
 * Applies the code typed on the sign-up page (stored by Clerk as
 * `unsafeMetadata.referralCodeAtSignup`, see app/sign-up/page.tsx) —
 * prd.md §2.1 "codes can be applied at signup".
 *
 * Runs on the dashboard, which loads right after signup verification,
 * not in the webhook: here we have the user's real IP for the referral
 * abuse check (the webhook comes from Clerk's servers). The metadata is
 * cleared after one try, whatever the outcome, so a bad code isn't
 * retried on every page load or charged against the rate limit.
 */
export async function applySignupCodeOnce(input: {
  userId: string;
  clerkUserId: string;
  ip: string | null;
}): Promise<SignupCodeOutcome> {
  const db = getDb();
  if (await hasRedeemedCode(db, input.userId)) return { status: "none" };

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(input.clerkUserId);
  const raw = clerkUser.unsafeMetadata?.referralCodeAtSignup;
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return { status: "none" };

  let outcome: SignupCodeOutcome;
  try {
    const result = await redeemCode(db, { userId: input.userId, code, ip: input.ip });
    outcome = { status: "applied", credits: result.creditsToUser };
  } catch (err) {
    if (!(err instanceof CodeRedemptionError)) throw err;
    outcome = { status: "rejected", message: err.message };
  }

  const { referralCodeAtSignup: _, ...rest } = clerkUser.unsafeMetadata ?? {};
  await client.users.updateUserMetadata(input.clerkUserId, {
    unsafeMetadata: { ...rest, referralCodeAtSignup: null },
  });
  return outcome;
}
