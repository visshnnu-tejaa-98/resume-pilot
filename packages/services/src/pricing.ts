import type { PricingConfig } from "@resume-pilot/credits";
import { auditLogs, pricingConfig, type Database } from "@resume-pilot/database";
import { modelPricesSchema, type CreatePricingConfigVersionInput } from "@resume-pilot/validators";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Pricing config reads/writes — prd.md §3.3, §3.6, §16.4.
 *
 * Rows are never updated in place: an admin change inserts version N+1
 * and deactivates N in one transaction. That's what lets markup or
 * minimums change without a deploy while every `ai_jobs` row keeps
 * pointing at the exact config it was charged under.
 */

export interface PricingConfigRecord extends PricingConfig {
  id: string;
  active: boolean;
  createdByUserId: string | null;
  note: string | null;
  createdAt: Date;
}

export class NoActivePricingConfigError extends Error {
  constructor() {
    super("No active pricing_config row — seed or create one before charging");
    this.name = "NoActivePricingConfigError";
  }
}

type PricingConfigRow = typeof pricingConfig.$inferSelect;

/** Numeric columns come back from Postgres as strings; JSONB is re-validated, not trusted. */
function toRecord(row: PricingConfigRow): PricingConfigRecord {
  return {
    id: row.id,
    version: row.version,
    modelPrices: modelPricesSchema.parse(row.modelPrices),
    usdToInrRate: Number(row.usdToInrRate),
    markupMultiplier: Number(row.markupMultiplier),
    minimumCreditsPerAction: row.minimumCreditsPerAction,
    creditValueInr: Number(row.creditValueInr),
    active: row.active,
    createdByUserId: row.createdByUserId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * The config new charges use. Read fresh on every estimate — no
 * in-process cache — so an admin change applies to the very next charge
 * on every web/worker instance.
 */
export async function getActivePricingConfig(db: Database): Promise<PricingConfigRecord> {
  const [row] = await db
    .select()
    .from(pricingConfig)
    .where(eq(pricingConfig.active, true))
    .limit(1);
  if (!row) throw new NoActivePricingConfigError();
  return toRecord(row);
}

/** A specific version — for re-pricing a capture under the version its estimate used. */
export async function getPricingConfigByVersion(
  db: Database,
  version: number,
): Promise<PricingConfigRecord | null> {
  const [row] = await db
    .select()
    .from(pricingConfig)
    .where(eq(pricingConfig.version, version))
    .limit(1);
  return row ? toRecord(row) : null;
}

/** All versions, newest first — admin history view. */
export async function listPricingConfigs(db: Database): Promise<PricingConfigRecord[]> {
  const rows = await db.select().from(pricingConfig).orderBy(desc(pricingConfig.version));
  return rows.map(toRecord);
}

/** Arbitrary constant key for the advisory lock serialising version creation. */
const PRICING_CONFIG_LOCK_KEY = 0x70726963; // "pric"

/**
 * Creates version N+1, makes it the only active row, and writes an
 * audit log entry with the admin's reason — all in one transaction.
 * An advisory lock serialises concurrent admins so they get N+1 and
 * N+2 rather than one failing on the unique version index.
 */
export async function createPricingConfigVersion(
  db: Database,
  adminUserId: string,
  input: CreatePricingConfigVersionInput,
): Promise<PricingConfigRecord> {
  const { config, reason } = input;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${PRICING_CONFIG_LOCK_KEY})`);

    const [previous] = await tx
      .select({ version: pricingConfig.version })
      .from(pricingConfig)
      .where(eq(pricingConfig.active, true))
      .limit(1);
    const [{ maxVersion } = { maxVersion: 0 }] = await tx
      .select({ maxVersion: sql<number>`coalesce(max(${pricingConfig.version}), 0)::int` })
      .from(pricingConfig);

    await tx.update(pricingConfig).set({ active: false }).where(eq(pricingConfig.active, true));

    const [row] = await tx
      .insert(pricingConfig)
      .values({
        version: maxVersion + 1,
        modelPrices: config.modelPrices,
        usdToInrRate: config.usdToInrRate.toFixed(4),
        markupMultiplier: config.markupMultiplier.toFixed(3),
        minimumCreditsPerAction: config.minimumCreditsPerAction,
        creditValueInr: config.creditValueInr.toFixed(4),
        active: true,
        createdByUserId: adminUserId,
        note: reason,
      })
      .returning();
    if (!row) throw new Error("pricing_config insert returned no row");

    await tx.insert(auditLogs).values({
      adminUserId,
      action: "pricing_config.create_version",
      targetType: "pricing_config",
      targetId: row.id,
      reason,
      metadata: { version: row.version, previousVersion: previous?.version ?? null, config },
    });

    return toRecord(row);
  });
}
