import { randomUUID } from "node:crypto";
import {
  createDatabase,
  creditAccounts,
  referralCodes,
  users,
  type Database,
} from "@resume-pilot/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserFromClerkWebhook, getUserByClerkId, getWalletSummary } from "./user";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("createUserFromClerkWebhook", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  it("creates a user, a 0-credit wallet, and a referral code in one go", async () => {
    const clerkUserId = `clerk_${randomUUID()}`;
    const result = await createUserFromClerkWebhook(db, {
      clerkUserId,
      email: "new-user@example.com",
    });

    expect(result.created).toBe(true);

    const profile = await getUserByClerkId(db, clerkUserId);
    expect(profile?.email).toBe("new-user@example.com");
    expect(profile?.role).toBe("user");
    expect(profile?.status).toBe("active");

    const wallet = await getWalletSummary(db, result.userId);
    expect(wallet.balance).toBe(0);
    expect(wallet.referralCode).toMatch(/^RP-[A-Z0-9]{6}$/);
  });

  it("is idempotent under a duplicate webhook delivery (sequential)", async () => {
    const clerkUserId = `clerk_${randomUUID()}`;

    const first = await createUserFromClerkWebhook(db, { clerkUserId, email: "dup@example.com" });
    const second = await createUserFromClerkWebhook(db, { clerkUserId, email: "dup@example.com" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    const userRows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(userRows).toHaveLength(1);

    const walletRows = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, first.userId));
    expect(walletRows).toHaveLength(1);

    const referralRows = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, first.userId));
    expect(referralRows).toHaveLength(1);
  });

  it("is idempotent under truly concurrent duplicate deliveries", async () => {
    // The real failure mode a check-then-insert approach misses: two
    // requests racing for the same Clerk user id at the same instant.
    const clerkUserId = `clerk_${randomUUID()}`;

    const [a, b] = await Promise.all([
      createUserFromClerkWebhook(db, { clerkUserId, email: "race@example.com" }),
      createUserFromClerkWebhook(db, { clerkUserId, email: "race@example.com" }),
    ]);

    // Exactly one of the two concurrent calls created the row.
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(a.userId).toBe(b.userId);

    const userRows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(userRows).toHaveLength(1);
  });

  afterAll(async () => {
    await db.$client.end();
  });
});
