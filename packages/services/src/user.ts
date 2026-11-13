import { randomInt } from "node:crypto";
import { creditAccounts, referralCodes, users, type Database } from "@resume-pilot/database";

export interface ClerkUserCreatedInput {
  clerkUserId: string;
  email: string;
}

export interface CreateUserResult {
  userId: string;
  /** false when this was a retried/duplicate webhook delivery. */
  created: boolean;
}

const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_CODE_MAX_ATTEMPTS = 5;

function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return `RP-${code}`;
}

/**
 * Handles the Clerk `user.created` webhook idempotently — prd.md §4.2,
 * tasks/todo/m1-foundation/04-auth-clerk-integration.md. Creates the app
 * `users` row, an empty (0-credit) wallet, and a referral code, all in
 * one transaction.
 *
 * Idempotency doesn't rely on a check-then-insert (which races under
 * concurrent duplicate deliveries); it relies on `users.clerk_user_id`'s
 * unique DB constraint plus `onConflictDoNothing`, so two requests
 * racing for the same Clerk user id can never both "win".
 */
export async function createUserFromClerkWebhook(
  db: Database,
  input: ClerkUserCreatedInput,
): Promise<CreateUserResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ clerkUserId: input.clerkUserId, email: input.email })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning();

    const insertedUser = inserted[0];
    if (!insertedUser) {
      const existing = await tx.query.users.findFirst({
        where: (u, { eq }) => eq(u.clerkUserId, input.clerkUserId),
      });
      if (!existing) {
        // Can only happen if the row was deleted between the failed
        // insert and this lookup, inside the same transaction — never
        // in practice, but keeps the return type honest.
        throw new Error(`User ${input.clerkUserId} vanished mid-transaction`);
      }
      return { userId: existing.id, created: false };
    }

    await tx
      .insert(creditAccounts)
      .values({ userId: insertedUser.id, balance: 0 })
      .onConflictDoNothing({ target: creditAccounts.userId });

    for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt++) {
      try {
        await tx.insert(referralCodes).values({
          userId: insertedUser.id,
          code: generateReferralCode(),
        });
        break;
      } catch (err) {
        const isCodeCollision =
          err instanceof Error && err.message.includes("referral_codes_lower_code_key");
        if (!isCodeCollision || attempt === REFERRAL_CODE_MAX_ATTEMPTS - 1) {
          throw err;
        }
        // Collided with another user's code (astronomically unlikely at
        // this code-space size) — regenerate and retry.
      }
    }

    return { userId: insertedUser.id, created: true };
  });
}

export interface UserProfile {
  id: string;
  clerkUserId: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
}

/** Server-side role resolution — prd.md §4.3: never trust a client-supplied role. */
export async function getUserByClerkId(
  db: Database,
  clerkUserId: string,
): Promise<UserProfile | undefined> {
  return db.query.users.findFirst({
    where: (u, { eq }) => eq(u.clerkUserId, clerkUserId),
  });
}

export interface WalletSummary {
  balance: number;
  referralCode: string | null;
}

export async function getWalletSummary(db: Database, userId: string): Promise<WalletSummary> {
  const [account, referral] = await Promise.all([
    db.query.creditAccounts.findFirst({ where: (a, { eq }) => eq(a.userId, userId) }),
    db.query.referralCodes.findFirst({ where: (r, { eq }) => eq(r.userId, userId) }),
  ]);

  return {
    balance: account?.balance ?? 0,
    referralCode: referral?.code ?? null,
  };
}
