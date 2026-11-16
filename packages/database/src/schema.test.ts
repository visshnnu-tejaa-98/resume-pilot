import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema/index";

const connectionString = process.env.DATABASE_URL;

/**
 * Drizzle's postgres-js adapter wraps the real driver error in its own
 * `DrizzleQueryError` (message: "Failed query: ..."); the actual
 * Postgres error — the one with the constraint name — is on `.cause`.
 */
async function expectConstraintViolation(promise: Promise<unknown>, constraintName: string) {
  await expect(promise).rejects.toMatchObject({
    cause: expect.objectContaining({ constraint_name: constraintName }),
  });
}

/**
 * These tests only run when DATABASE_URL is set (a real Postgres —
 * e.g. the dev container from tasks/testing/m1-foundation/03), since
 * the thing being tested is DB-level constraint enforcement, which
 * cannot be faked with a mock. CI wires DATABASE_URL to a throwaway
 * Postgres service container.
 */
describe.skipIf(!connectionString)("database schema constraints", () => {
  const sql = postgres(connectionString ?? "", { max: 1 });
  const db = drizzle(sql, { schema });
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ clerkUserId: `vitest_${Date.now()}`, email: "vitest@example.com" })
      .returning();
    userId = user!.id;
  });

  afterAll(async () => {
    // These tests insert raw ledger rows to probe constraints, bypassing
    // postLedgerEntry, so the wallet wouldn't reconcile. Deleting the user
    // cascades its rows away (the one delete the append-only trigger allows).
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await sql.end();
  });

  it("rejects a negative credit_accounts balance", async () => {
    await expectConstraintViolation(
      db.insert(schema.creditAccounts).values({ userId, balance: -1 }),
      "credit_accounts_balance_non_negative_check",
    );
  });

  it("allows a zero balance", async () => {
    const [account] = await db
      .insert(schema.creditAccounts)
      .values({ userId, balance: 0 })
      .returning();
    expect(account?.balance).toBe(0);
  });

  it("rejects a duplicate (source_type, source_id) in credit_ledger", async () => {
    const sourceId = randomUUID();
    await db.insert(schema.creditLedger).values({
      userId,
      type: "purchase",
      credits: 500,
      balanceAfter: 500,
      sourceType: "payment",
      sourceId,
    });

    await expectConstraintViolation(
      db.insert(schema.creditLedger).values({
        userId,
        type: "purchase",
        credits: 500,
        balanceAfter: 1000,
        sourceType: "payment",
        sourceId,
      }),
      "credit_ledger_source_type_source_id_key",
    );
  });

  it("rejects a job_descriptions text shorter than 200 characters", async () => {
    await expectConstraintViolation(
      db.insert(schema.jobDescriptions).values({ userId, text: "too short" }),
      "job_descriptions_text_length_check",
    );
  });

  it("rejects a second code_redemptions row for the same user (one code per account)", async () => {
    await db.insert(schema.codeRedemptions).values({
      userId,
      codeType: "coupon",
      creditsToUser: 500,
    });

    await expectConstraintViolation(
      db.insert(schema.codeRedemptions).values({
        userId,
        codeType: "coupon",
        creditsToUser: 500,
      }),
      "code_redemptions_user_id_key",
    );
  });

  it("treats coupon codes as case-insensitive via the lower(code) unique index", async () => {
    const code = `WELCOME10_${randomUUID().slice(0, 8)}`;
    await db.insert(schema.coupons).values({ code, credits: 100 });
    await expectConstraintViolation(
      db.insert(schema.coupons).values({ code: code.toLowerCase(), credits: 999 }),
      "coupons_lower_code_key",
    );
  });
});
