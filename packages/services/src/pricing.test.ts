import { randomUUID } from "node:crypto";
import { calculateCredits } from "@resume-pilot/credits";
import {
  aiJobs,
  auditLogs,
  createDatabase,
  pricingConfig,
  users,
  type Database,
} from "@resume-pilot/database";
import type { PricingConfigInput } from "@resume-pilot/validators";
import { and, eq, gt } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPricingConfigVersion,
  getActivePricingConfig,
  getPricingConfigByVersion,
  listPricingConfigs,
} from "./pricing";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

const baseConfig: PricingConfigInput = {
  modelPrices: { "gpt-5.1": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 } },
  usdToInrRate: 83,
  markupMultiplier: 3,
  minimumCreditsPerAction: 50,
  creditValueInr: 0.05,
};

// Real Postgres, not mocked. These tests change which config is active,
// so afterAll deletes every version they created and re-activates the
// one that was active before — the local dev DB is left as it was.
describe.skipIf(!connectionString)("pricing config (real DB)", () => {
  let db: Database;
  let adminUserId: string;
  let originalActiveVersion: number;
  let maxVersionBefore: number;

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    const original = await getActivePricingConfig(db);
    originalActiveVersion = original.version;
    maxVersionBefore = Math.max(...(await listPricingConfigs(db)).map((c) => c.version));

    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: "pricing-admin@example.com",
    });
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    adminUserId = userId;
  });

  afterAll(async () => {
    await db.delete(aiJobs).where(eq(aiJobs.userId, adminUserId));
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminUserId));
    await db.delete(pricingConfig).where(gt(pricingConfig.version, maxVersionBefore));
    await db
      .update(pricingConfig)
      .set({ active: true })
      .where(eq(pricingConfig.version, originalActiveVersion));
    await db.delete(users).where(eq(users.id, adminUserId));
    await db.$client.end();
  });

  it("parses numeric columns and JSONB model prices into numbers", async () => {
    const active = await getActivePricingConfig(db);
    expect(typeof active.markupMultiplier).toBe("number");
    expect(typeof active.usdToInrRate).toBe("number");
    expect(typeof active.creditValueInr).toBe("number");
    expect(Object.keys(active.modelPrices).length).toBeGreaterThan(0);
  });

  it("creating a version bumps the number, makes it the only active row, and audits it", async () => {
    const before = await getActivePricingConfig(db);
    const created = await createPricingConfigVersion(db, adminUserId, {
      config: baseConfig,
      reason: "test: baseline",
    });

    expect(created.version).toBeGreaterThan(before.version);
    expect(created.active).toBe(true);
    expect(created.createdByUserId).toBe(adminUserId);
    expect((await getActivePricingConfig(db)).version).toBe(created.version);
    expect((await getPricingConfigByVersion(db, before.version))?.active).toBe(false);

    const actives = await db.select().from(pricingConfig).where(eq(pricingConfig.active, true));
    expect(actives).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.adminUserId, adminUserId), eq(auditLogs.targetId, created.id)));
    expect(audit?.action).toBe("pricing_config.create_version");
    expect(audit?.reason).toBe("test: baseline");
    expect(audit?.metadata).toMatchObject({
      version: created.version,
      previousVersion: before.version,
    });
  });

  it("changing markup affects new charges without a code change; old versions are untouched", async () => {
    const usage = { inputTokens: 4000, outputTokens: 2000 }; // ₹2.49 AI cost

    const v1 = await createPricingConfigVersion(db, adminUserId, {
      config: { ...baseConfig, markupMultiplier: 3 },
      reason: "test: markup 3",
    });
    const charge1 = calculateCredits(await getActivePricingConfig(db), "gpt-5.1", usage);

    const v2 = await createPricingConfigVersion(db, adminUserId, {
      config: { ...baseConfig, markupMultiplier: 4 },
      reason: "test: markup 4",
    });
    const charge2 = calculateCredits(await getActivePricingConfig(db), "gpt-5.1", usage);

    expect(charge1).toMatchObject({ credits: 150, pricingConfigVersion: v1.version });
    expect(charge2).toMatchObject({ credits: 200, pricingConfigVersion: v2.version });

    // A capture re-priced under the old version still gets the old price.
    const old = await getPricingConfigByVersion(db, v1.version);
    expect(old?.markupMultiplier).toBe(3);
    expect(calculateCredits(old!, "gpt-5.1", usage).credits).toBe(150);
  });

  it("concurrent version creation is serialised — distinct versions, still one active", async () => {
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        createPricingConfigVersion(db, adminUserId, {
          config: { ...baseConfig, minimumCreditsPerAction: n },
          reason: `test: concurrent ${n}`,
        }),
      ),
    );
    const versions = results.map((r) => r.version);
    expect(new Set(versions).size).toBe(3);

    const actives = await db.select().from(pricingConfig).where(eq(pricingConfig.active, true));
    expect(actives).toHaveLength(1);
    expect(actives[0]?.version).toBe(Math.max(...versions));
  });

  it("ai_jobs records the pricing version used, and the DB refuses a row without one", async () => {
    const active = await getActivePricingConfig(db);
    const estimate = calculateCredits(active, "gpt-5.1", { inputTokens: 1000, outputTokens: 1000 });

    const [job] = await db
      .insert(aiJobs)
      .values({
        userId: adminUserId,
        type: "generation",
        model: "gpt-5.1",
        creditsEstimated: estimate.credits,
        pricingConfigVersion: estimate.pricingConfigVersion,
        idempotencyKey: `test_${randomUUID()}`,
      })
      .returning();
    expect(job?.pricingConfigVersion).toBe(active.version);

    // Missing version → NOT NULL violation.
    await expect(
      db.insert(aiJobs).values({
        userId: adminUserId,
        type: "generation",
        creditsEstimated: 1,
        idempotencyKey: `test_${randomUUID()}`,
      } as typeof aiJobs.$inferInsert),
    ).rejects.toThrow();

    // Non-existent version → FK violation.
    await expect(
      db.insert(aiJobs).values({
        userId: adminUserId,
        type: "generation",
        creditsEstimated: 1,
        pricingConfigVersion: 999_999,
        idempotencyKey: `test_${randomUUID()}`,
      }),
    ).rejects.toThrow();
  });

  it("the DB rejects a second active row and non-positive markup directly", async () => {
    const [{ version } = { version: 0 }] = await db
      .select({ version: pricingConfig.version })
      .from(pricingConfig)
      .where(eq(pricingConfig.active, true));

    const row = {
      modelPrices: baseConfig.modelPrices,
      usdToInrRate: "83.0000",
      minimumCreditsPerAction: 0,
      createdByUserId: adminUserId,
    };
    await expect(
      db
        .insert(pricingConfig)
        .values({ ...row, version: 900_000 + version, markupMultiplier: "2.000", active: true }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(pricingConfig)
        .values({ ...row, version: 900_001 + version, markupMultiplier: "0.000", active: false }),
    ).rejects.toThrow();
  });
});
