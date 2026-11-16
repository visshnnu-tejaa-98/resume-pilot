import { randomUUID } from "node:crypto";
import type { CreditEstimate } from "@resume-pilot/credits";
import {
  aiJobs,
  createDatabase,
  creditAccounts,
  creditHolds,
  creditLedger,
  users,
  type Database,
} from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  captureHold,
  estimateAction,
  expireStaleHolds,
  getWalletBalance,
  HOLD_TTL_MS,
  HoldNotActiveError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  placeHold,
  releaseHold,
} from "./credits";
import { getActivePricingConfig } from "./pricing";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("estimate → hold → capture (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  let pricingVersion: number;
  let model: string;

  /** A user with `balance` credits (set directly; grants are M2-03). */
  async function userWith(balance: number) {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `credits-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    await db.update(creditAccounts).set({ balance }).where(eq(creditAccounts.userId, userId));
    return userId;
  }

  function estimate(
    credits: number,
    action: CreditEstimate["action"] = "generation",
  ): CreditEstimate {
    return {
      action,
      credits,
      model,
      inputTokens: 5000,
      maxOutputTokens: 6000,
      pricingConfigVersion: pricingVersion,
    };
  }

  const key = () => `test:${randomUUID()}`;

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    const config = await getActivePricingConfig(db);
    pricingVersion = config.version;
    model = config.actionSettings.generation.model;
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  describe("estimateAction", () => {
    it("counts input tokens with the tokenizer, adds overhead and the output budget", async () => {
      const config = await getActivePricingConfig(db);
      const short = await estimateAction(db, "generation", ["short resume"]);
      const long = await estimateAction(db, "generation", ["word ".repeat(20_000)]);

      expect(short.pricingConfigVersion).toBe(config.version);
      expect(short.maxOutputTokens).toBe(config.actionSettings.generation.maxOutputTokens);
      expect(short.inputTokens).toBeGreaterThan(
        config.actionSettings.generation.promptOverheadTokens,
      );
      expect(long.inputTokens - short.inputTokens).toBeGreaterThan(15_000);
      expect(long.credits).toBeGreaterThan(short.credits);
      expect(short.credits).toBeGreaterThanOrEqual(config.minimumCreditsPerAction);
    });
  });

  describe("placeHold", () => {
    it("reserves credits without moving the balance", async () => {
      const userId = await userWith(1000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(300) });

      expect(hold).toMatchObject({ credits: 300, created: true });
      expect(await getWalletBalance(db, userId)).toEqual({
        balance: 1000,
        held: 300,
        available: 700,
      });

      const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, hold.aiJobId));
      expect(job).toMatchObject({
        status: "pending",
        creditsEstimated: 300,
        pricingConfigVersion: pricingVersion,
        model,
      });
    });

    it("rejects when available balance (balance − holds) is too low", async () => {
      const userId = await userWith(500);
      await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(400) });

      const attempt = placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(200) });
      await expect(attempt).rejects.toBeInstanceOf(InsufficientCreditsError);
      await expect(attempt).rejects.toMatchObject({ required: 200, available: 100 });
    });

    it("the same idempotency key never creates a second hold (sequential and concurrent)", async () => {
      const userId = await userWith(1000);
      const k = key();
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map(() =>
          placeHold(db, { userId, idempotencyKey: k, estimate: estimate(300) }),
        ),
      );

      expect(new Set(results.map((r) => r.aiJobId)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect((await getWalletBalance(db, userId)).held).toBe(300);
    });

    it("refuses an idempotency key reused for a different user or action", async () => {
      const a = await userWith(1000);
      const b = await userWith(1000);
      const k = key();
      await placeHold(db, { userId: a, idempotencyKey: k, estimate: estimate(100) });

      await expect(
        placeHold(db, { userId: b, idempotencyKey: k, estimate: estimate(100) }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
      await expect(
        placeHold(db, { userId: a, idempotencyKey: k, estimate: estimate(100, "ats_scoring") }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
    });

    it("load test: 20 parallel holds never overspend the available balance (16.2.5)", async () => {
      const userId = await userWith(1000);
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(150) }),
        ),
      );

      const ok = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      // floor(1000 / 150) = 6
      expect(ok).toHaveLength(6);
      expect(rejected).toHaveLength(14);
      for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientCreditsError);

      const wallet = await getWalletBalance(db, userId);
      expect(wallet.held).toBe(900);
      expect(wallet.available).toBe(100);
    });

    it("load test: 20 parallel hold+capture flows never take the balance below zero", async () => {
      const userId = await userWith(1000);
      const usage = { inputTokens: 1000, outputTokens: 500 };

      await Promise.allSettled(
        Array.from({ length: 20 }, async () => {
          const hold = await placeHold(db, {
            userId,
            idempotencyKey: key(),
            estimate: estimate(150),
          });
          return captureHold(db, { aiJobId: hold.aiJobId, usage });
        }),
      );

      const wallet = await getWalletBalance(db, userId);
      const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      const spent = -ledger.reduce((sum, row) => sum + row.credits, 0);
      expect(wallet.balance).toBeGreaterThanOrEqual(0);
      expect(wallet.balance).toBe(1000 - spent);
      expect(wallet.held).toBe(0);
      expect(spent).toBeGreaterThan(0);
    });
  });

  describe("captureHold", () => {
    it("charges actual usage, releases the rest, one ledger debit, job succeeded", async () => {
      const userId = await userWith(10_000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(5000) });
      const usage = { inputTokens: 2000, outputTokens: 1000 };

      const result = await captureHold(db, { aiJobId: hold.aiJobId, usage });

      expect(result.captured).toBe(true);
      expect(result.creditsCharged).toBe(result.creditsActual);
      expect(result.creditsCharged).toBeLessThan(5000);
      expect(result.creditsReleased).toBe(5000 - result.creditsCharged);
      expect(await getWalletBalance(db, userId)).toEqual({
        balance: 10_000 - result.creditsCharged,
        held: 0,
        available: 10_000 - result.creditsCharged,
      });

      const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        type: "capture",
        credits: -result.creditsCharged,
        balanceAfter: 10_000 - result.creditsCharged,
        sourceType: "ai_job",
        sourceId: hold.aiJobId,
      });

      const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, hold.aiJobId));
      expect(job).toMatchObject({
        status: "succeeded",
        inputTokens: 2000,
        outputTokens: 1000,
        creditsCharged: result.creditsCharged,
      });
      expect(job?.costPaise).toBeGreaterThan(0);
    });

    it("never charges more than the estimate, even if usage overran it (16.2.4)", async () => {
      const userId = await userWith(10_000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(60) });

      const result = await captureHold(db, {
        aiJobId: hold.aiJobId,
        usage: { inputTokens: 500_000, outputTokens: 200_000 },
      });

      expect(result.creditsActual).toBeGreaterThan(60);
      expect(result.creditsCharged).toBe(60);
      expect((await getWalletBalance(db, userId)).balance).toBe(10_000 - 60);
    });

    it("a retried capture never double-charges", async () => {
      const userId = await userWith(10_000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(5000) });
      const usage = { inputTokens: 2000, outputTokens: 1000 };

      const [a, b] = await Promise.all([
        captureHold(db, { aiJobId: hold.aiJobId, usage }),
        captureHold(db, { aiJobId: hold.aiJobId, usage }),
      ]);
      const c = await captureHold(db, { aiJobId: hold.aiJobId, usage });

      expect([a, b].filter((r) => r.captured)).toHaveLength(1);
      expect(c.captured).toBe(false);
      expect(c.creditsCharged).toBe(a.captured ? a.creditsCharged : b.creditsCharged);
      const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(ledger).toHaveLength(1);
    });

    it("can't capture a released hold", async () => {
      const userId = await userWith(1000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(100) });
      await releaseHold(db, { aiJobId: hold.aiJobId, reason: "test" });

      await expect(
        captureHold(db, { aiJobId: hold.aiJobId, usage: { inputTokens: 1, outputTokens: 1 } }),
      ).rejects.toBeInstanceOf(HoldNotActiveError);
      expect((await getWalletBalance(db, userId)).balance).toBe(1000);
    });

    it("an expired hold is released at capture time and charges nothing", async () => {
      const userId = await userWith(1000);
      const placedAt = new Date(Date.now() - HOLD_TTL_MS - 1000);
      const hold = await placeHold(
        db,
        { userId, idempotencyKey: key(), estimate: estimate(100) },
        placedAt,
      );

      await expect(
        captureHold(db, { aiJobId: hold.aiJobId, usage: { inputTokens: 1, outputTokens: 1 } }),
      ).rejects.toBeInstanceOf(HoldNotActiveError);

      const [h] = await db.select().from(creditHolds).where(eq(creditHolds.id, hold.holdId));
      expect(h?.status).toBe("released");
      expect((await getWalletBalance(db, userId)).balance).toBe(1000);
    });
  });

  describe("releaseHold", () => {
    it("releases in full, marks the job failed with 0 charged, and is idempotent", async () => {
      const userId = await userWith(1000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(400) });

      expect(await releaseHold(db, { aiJobId: hold.aiJobId, reason: "validation failed" })).toEqual(
        {
          released: true,
        },
      );
      expect(await releaseHold(db, { aiJobId: hold.aiJobId, reason: "again" })).toEqual({
        released: false,
      });

      expect(await getWalletBalance(db, userId)).toEqual({
        balance: 1000,
        held: 0,
        available: 1000,
      });
      const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, hold.aiJobId));
      expect(job).toMatchObject({
        status: "failed",
        error: "validation failed",
        creditsCharged: 0,
      });
      const ledger = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(ledger).toHaveLength(0);
    });

    it("never releases a captured hold", async () => {
      const userId = await userWith(10_000);
      const hold = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(5000) });
      await captureHold(db, {
        aiJobId: hold.aiJobId,
        usage: { inputTokens: 100, outputTokens: 100 },
      });

      expect(await releaseHold(db, { aiJobId: hold.aiJobId, reason: "late failure" })).toEqual({
        released: false,
      });
      const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, hold.aiJobId));
      expect(job?.status).toBe("succeeded");
    });
  });

  describe("expireStaleHolds", () => {
    it("releases only holds past 15 minutes; expired holds stop counting immediately", async () => {
      const userId = await userWith(1000);
      const old = await placeHold(
        db,
        { userId, idempotencyKey: key(), estimate: estimate(300) },
        new Date(Date.now() - HOLD_TTL_MS - 60_000),
      );
      const fresh = await placeHold(db, { userId, idempotencyKey: key(), estimate: estimate(200) });

      // Before the sweep, the expired hold already doesn't reduce available.
      expect(await getWalletBalance(db, userId)).toEqual({
        balance: 1000,
        held: 200,
        available: 800,
      });

      const { expired } = await expireStaleHolds(db);
      expect(expired).toBeGreaterThanOrEqual(1);

      const holds = await db.select().from(creditHolds).where(eq(creditHolds.userId, userId));
      expect(holds.find((h) => h.id === old.holdId)?.status).toBe("released");
      expect(holds.find((h) => h.id === fresh.holdId)?.status).toBe("active");
      const [job] = await db.select().from(aiJobs).where(eq(aiJobs.id, old.aiJobId));
      expect(job?.status).toBe("failed");
    });
  });
});
