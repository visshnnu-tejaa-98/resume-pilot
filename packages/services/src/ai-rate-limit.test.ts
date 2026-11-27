import { randomUUID } from "node:crypto";
import type { CreditEstimate } from "@resume-pilot/credits";
import { aiJobs, createDatabase, creditAccounts, users, type Database } from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_ACTIONS_PER_MINUTE, AiRateLimitError, getWalletBalance, placeHold } from "./credits";
import { getActivePricingConfig } from "./pricing";
import { createUserFromClerkWebhook } from "./user";

/** prd.md §15: at most 10 paid AI actions per user per minute, enforced where every hold is placed. */

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("AI actions per minute (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  let est: CreditEstimate;

  async function richUser() {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `rl-${randomUUID()}@example.com` });
    userIds.push(userId);
    await db.update(creditAccounts).set({ balance: 1_000_000 }).where(eq(creditAccounts.userId, userId));
    return userId;
  }

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    const config = await getActivePricingConfig(db);
    est = { action: "generation", credits: 10, model: config.actionSettings.generation.model, inputTokens: 1000, maxOutputTokens: 1000, pricingConfigVersion: config.version };
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  it(`allows ${AI_ACTIONS_PER_MINUTE} in a minute, refuses the next — even with plenty of credits`, async () => {
    const userId = await richUser();
    for (let i = 0; i < AI_ACTIONS_PER_MINUTE; i++) await placeHold(db, { userId, idempotencyKey: randomUUID(), estimate: est });
    await expect(placeHold(db, { userId, idempotencyKey: randomUUID(), estimate: est })).rejects.toBeInstanceOf(AiRateLimitError);
    expect((await getWalletBalance(db, userId)).held).toBe(AI_ACTIONS_PER_MINUTE * est.credits);
  });

  it("20 parallel requests: exactly 10 get through (the check runs under the account lock)", async () => {
    const userId = await richUser();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => placeHold(db, { userId, idempotencyKey: randomUUID(), estimate: est })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(AI_ACTIONS_PER_MINUTE);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AiRateLimitError);
  });

  it("a retry of an already-placed hold (same idempotency key) isn't blocked or counted again", async () => {
    const userId = await richUser();
    const keys = Array.from({ length: AI_ACTIONS_PER_MINUTE }, () => randomUUID());
    for (const k of keys) await placeHold(db, { userId, idempotencyKey: k, estimate: est });
    const again = await placeHold(db, { userId, idempotencyKey: keys[0]!, estimate: est });
    expect(again.created).toBe(false);
  });

  it("the window slides: jobs older than a minute don't count", async () => {
    const userId = await richUser();
    for (let i = 0; i < AI_ACTIONS_PER_MINUTE; i++) await placeHold(db, { userId, idempotencyKey: randomUUID(), estimate: est });
    await db.update(aiJobs).set({ createdAt: new Date(Date.now() - 61_000) }).where(eq(aiJobs.userId, userId));
    await expect(placeHold(db, { userId, idempotencyKey: randomUUID(), estimate: est })).resolves.toMatchObject({ created: true });
  });

  it("one user's burst doesn't limit another user", async () => {
    const a = await richUser();
    const b = await richUser();
    for (let i = 0; i < AI_ACTIONS_PER_MINUTE; i++) await placeHold(db, { userId: a, idempotencyKey: randomUUID(), estimate: est });
    await expect(placeHold(db, { userId: b, idempotencyKey: randomUUID(), estimate: est })).resolves.toMatchObject({ created: true });
  });
});
