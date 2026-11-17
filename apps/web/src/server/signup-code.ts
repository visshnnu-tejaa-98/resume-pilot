import { clerkClient } from "@clerk/nextjs/server";
import { CodeRedemptionError, hasEmailPreferencesRow, hasRedeemedCode, redeemCode, setEmailPreferences } from "@resume-pilot/services";
import { enqueueTransactionalEmail } from "@resume-pilot/queue";
import { getDb } from "@/server/db";
import { getTransactionalEmailQueue } from "@/server/queue";

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
  // Both one-time steps done: no Clerk call on later dashboard loads.
  if ((await hasRedeemedCode(db, input.userId)) && (await hasEmailPreferencesRow(db, input.userId))) return { status: "none" };
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(input.clerkUserId);

  let metadata: Record<string, unknown> = { ...(clerkUser.unsafeMetadata ?? {}) };

  // Marketing consent from the sign-up form (prd.md §13.5), processed once. Unticked still
  // writes an all-off row, which marks this step done.
  if (!(await hasEmailPreferencesRow(db, input.userId))) {
    const consent = metadata.marketingConsentAtSignup === true;
    await setEmailPreferences(db, { userId: input.userId, source: "signup", reminders: consent, productUpdates: consent });
    if ("marketingConsentAtSignup" in metadata) {
      metadata = { ...metadata, marketingConsentAtSignup: null };
      await client.users.updateUserMetadata(input.clerkUserId, { unsafeMetadata: metadata });
    }
  }

  if (await hasRedeemedCode(db, input.userId)) return { status: "none" };
  const raw = metadata.referralCodeAtSignup;
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return { status: "none" };

  let outcome: SignupCodeOutcome;
  try {
    const result = await redeemCode(db, { userId: input.userId, code, ip: input.ip });
    outcome = { status: "applied", credits: result.creditsToUser };
    // §13.1 code_applied (best effort; the worker's outbox sweep catches a missed enqueue).
    await enqueueTransactionalEmail(getTransactionalEmailQueue(), { templateKey: "code_applied", userId: input.userId, redemptionId: result.redemptionId }).catch(() => undefined);
  } catch (err) {
    if (!(err instanceof CodeRedemptionError)) throw err;
    outcome = { status: "rejected", message: err.message };
  }

  const { referralCodeAtSignup: _, ...rest } = metadata;
  await client.users.updateUserMetadata(input.clerkUserId, {
    unsafeMetadata: { ...rest, referralCodeAtSignup: null },
  });
  return outcome;
}
