import { randomUUID } from "node:crypto";
import {
  auditLogs,
  createDatabase,
  creditAccounts,
  creditLedger,
  users,
  type Database,
} from "@resume-pilot/database";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureHold, placeHold, releaseHold } from "./credits";
import {
  adminAdjustCredits,
  findWalletMismatches,
  getWalletPage,
  grantCredits,
  NegativeBalanceError,
} from "./ledger";
import { getActivePricingConfig } from "./pricing";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("wallet ledger (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  let adminId: string;

  async function newUser() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `ledger-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return userId;
  }

  const grant = (
    userId: string,
    credits: number,
    type: "purchase" | "coupon_credit" = "purchase",
  ) =>
    grantCredits(db, {
      userId,
      type,
      credits,
      sourceType: type === "purchase" ? "payment" : "code_redemption",
      sourceId: randomUUID(),
    });

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    adminId = await newUser();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, adminId));
  });

  afterAll(async () => {
    // Ledger rows go with their users (the cascade the trigger allows).
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  describe("append-only", () => {
    it("the database rejects UPDATE, DELETE and TRUNCATE on credit_ledger", async () => {
      const userId = await newUser();
      const { entryId } = await grant(userId, 500);

      await expect(
        db.update(creditLedger).set({ credits: 999_999 }).where(eq(creditLedger.id, entryId)),
      ).rejects.toThrow();
      await expect(db.delete(creditLedger).where(eq(creditLedger.id, entryId))).rejects.toThrow();
      await expect(db.execute(sql`truncate credit_ledger`)).rejects.toThrow();

      const [row] = await db.select().from(creditLedger).where(eq(creditLedger.id, entryId));
      expect(row?.credits).toBe(500);
    });

    it("still lets an account deletion remove that user's ledger (DPDP)", async () => {
      const userId = await newUser();
      await grant(userId, 100);
      await db.delete(users).where(eq(users.id, userId));
      const rows = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(rows).toHaveLength(0);
    });
  });

  describe("postLedgerEntry via grants", () => {
    it("appends with balance_after and updates the cached balance together", async () => {
      const userId = await newUser();
      const a = await grant(userId, 10_000);
      const b = await grant(userId, 500, "coupon_credit");

      expect(a.balanceAfter).toBe(10_000);
      expect(b.balanceAfter).toBe(10_500);
      const [account] = await db
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, userId));
      expect(account?.balance).toBe(10_500);
    });

    it("posting the same source twice grants once (duplicate webhook)", async () => {
      const userId = await newUser();
      const sourceId = randomUUID();
      const input = {
        userId,
        type: "purchase" as const,
        credits: 10_000,
        sourceType: "payment" as const,
        sourceId,
      };

      const results = await Promise.all([1, 2, 3].map(() => grantCredits(db, input)));

      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.entryId)).size).toBe(1);
      const rows = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(rows).toHaveLength(1);
      expect((await findWalletMismatches(db, [userId])).length).toBe(0);
    });

    it("rejects zero, fractional and wrong-direction amounts", async () => {
      const userId = await newUser();
      await expect(grant(userId, 0)).rejects.toThrow(RangeError);
      await expect(grant(userId, 1.5)).rejects.toThrow(RangeError);
      await expect(grant(userId, -100)).rejects.toThrow(/must be a credit/);
    });
  });

  describe("adminAdjustCredits", () => {
    it("adds or removes credits with an audit log entry carrying the reason", async () => {
      const userId = await newUser();
      await grant(userId, 1000);

      const add = await adminAdjustCredits(db, {
        adminUserId: adminId,
        userId,
        credits: 250,
        reason: "goodwill for a failed export",
      });
      const remove = await adminAdjustCredits(db, {
        adminUserId: adminId,
        userId,
        credits: -200,
        reason: "duplicate grant correction",
      });

      expect(add.balanceAfter).toBe(1250);
      expect(remove.balanceAfter).toBe(1050);
      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.id, add.auditLogId));
      expect(audit).toMatchObject({
        action: "credits.adjust",
        targetId: userId,
        reason: "goodwill for a failed export",
      });
      const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.id, add.entryId));
      expect(entry).toMatchObject({ sourceType: "admin_adjustment", sourceId: add.auditLogId });
    });

    it("can't take a balance below zero, and writes nothing when refused", async () => {
      const userId = await newUser();
      await grant(userId, 100);
      const auditsBefore = await db.select().from(auditLogs).where(eq(auditLogs.targetId, userId));

      await expect(
        adminAdjustCredits(db, { adminUserId: adminId, userId, credits: -101, reason: "too much" }),
      ).rejects.toBeInstanceOf(NegativeBalanceError);

      const auditsAfter = await db.select().from(auditLogs).where(eq(auditLogs.targetId, userId));
      expect(auditsAfter).toHaveLength(auditsBefore.length);
      expect((await getWalletPage(db, userId)).balance).toBe(100);
    });

    it("requires a reason", async () => {
      const userId = await newUser();
      await expect(
        adminAdjustCredits(db, { adminUserId: adminId, userId, credits: 10, reason: "  " }),
      ).rejects.toThrow(/reason/);
    });
  });

  describe("reconciliation", () => {
    it("cached balance equals the ledger sum after grants, captures, releases and adjustments", async () => {
      const config = await getActivePricingConfig(db);
      const model = config.actionSettings.generation.model;
      const userId = await newUser();
      await grant(userId, 20_000);
      await grant(userId, 500, "coupon_credit");

      for (let i = 0; i < 5; i++) {
        const hold = await placeHold(db, {
          userId,
          idempotencyKey: `recon:${randomUUID()}`,
          estimate: {
            action: "generation",
            credits: 2000,
            model,
            inputTokens: 5000,
            maxOutputTokens: 6000,
            pricingConfigVersion: config.version,
          },
        });
        if (i % 2 === 0) {
          await captureHold(db, {
            aiJobId: hold.aiJobId,
            usage: { inputTokens: 3000 + i * 500, outputTokens: 1500 },
          });
        } else {
          await releaseHold(db, { aiJobId: hold.aiJobId, reason: "test failure" });
        }
      }
      await adminAdjustCredits(db, {
        adminUserId: adminId,
        userId,
        credits: -300,
        reason: "recon test",
      });

      expect(await findWalletMismatches(db, [userId])).toEqual([]);

      const [{ sum } = { sum: "0" }] = await db
        .select({ sum: sql<string>`sum(${creditLedger.credits})` })
        .from(creditLedger)
        .where(eq(creditLedger.userId, userId));
      expect((await getWalletPage(db, userId)).balance).toBe(Number(sum));
    });

    it("detects a cached balance that drifted from the ledger", async () => {
      const userId = await newUser();
      await grant(userId, 1000);
      // Simulate a bug that bypassed postLedgerEntry.
      await db
        .update(creditAccounts)
        .set({ balance: 1234 })
        .where(eq(creditAccounts.userId, userId));

      expect(await findWalletMismatches(db, [userId])).toEqual([
        { userId, cachedBalance: 1234, ledgerSum: 1000, lastBalanceAfter: 1000 },
      ]);
      // Put it back so the global reconciliation stays clean.
      await db
        .update(creditAccounts)
        .set({ balance: 1000 })
        .where(eq(creditAccounts.userId, userId));
    });

    it("a new wallet with no entries reconciles at 0", async () => {
      const userId = await newUser();
      expect(await findWalletMismatches(db, [userId])).toEqual([]);
    });
  });

  describe("getWalletPage", () => {
    it("shows balance, active holds and newest-first history with the charged action", async () => {
      const config = await getActivePricingConfig(db);
      const userId = await newUser();
      await grant(userId, 10_000);
      const captured = await placeHold(db, {
        userId,
        idempotencyKey: `page:${randomUUID()}`,
        estimate: {
          action: "ats_scoring",
          credits: 1000,
          model: config.actionSettings.ats_scoring.model,
          inputTokens: 1000,
          maxOutputTokens: 2500,
          pricingConfigVersion: config.version,
        },
      });
      await captureHold(db, {
        aiJobId: captured.aiJobId,
        usage: { inputTokens: 900, outputTokens: 800 },
      });
      const pending = await placeHold(db, {
        userId,
        idempotencyKey: `page:${randomUUID()}`,
        estimate: {
          action: "generation",
          credits: 3000,
          model: config.actionSettings.generation.model,
          inputTokens: 1000,
          maxOutputTokens: 6000,
          pricingConfigVersion: config.version,
        },
      });

      const page = await getWalletPage(db, userId);

      expect(page.held).toBe(3000);
      expect(page.available).toBe(page.balance - 3000);
      expect(page.activeHolds).toEqual([
        expect.objectContaining({ aiJobId: pending.aiJobId, action: "generation", credits: 3000 }),
      ]);
      expect(page.history.map((h) => h.type)).toEqual(["capture", "purchase"]);
      expect(page.history[0]).toMatchObject({ action: "ats_scoring", balanceAfter: page.balance });
      expect(page.history[1]).toMatchObject({
        action: null,
        credits: 10_000,
        balanceAfter: 10_000,
      });
      expect(page.nextCursor).toBeNull();
    });

    it("paginates without skipping or repeating entries", async () => {
      const userId = await newUser();
      for (let i = 1; i <= 7; i++) await grant(userId, i * 10);

      const seen: number[] = [];
      let cursor: string | null = null;
      do {
        const page: Awaited<ReturnType<typeof getWalletPage>> = await getWalletPage(db, userId, {
          limit: 3,
          cursor,
        });
        seen.push(...page.history.map((h) => h.credits));
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual([70, 60, 50, 40, 30, 20, 10]);
    });

    it("a cursor from another user's ledger returns nothing from it", async () => {
      const a = await newUser();
      const b = await newUser();
      const { entryId } = await grant(a, 100);
      await grant(b, 200);
      const page = await getWalletPage(db, b, { cursor: entryId });
      expect(page.history).toEqual([]);
    });
  });
});
