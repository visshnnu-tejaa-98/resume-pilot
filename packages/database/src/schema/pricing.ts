import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Model prices, FX rate, markup, minimums, credit value — versioned
 * (prd.md §3.3, §3.6). Rows are append-only: an admin change inserts a
 * new version and flips `active`, so every `ai_jobs` row can always be
 * re-priced against exactly the config it was charged under. At most
 * one row is active at a time (partial unique index below).
 */
export const pricingConfig = pgTable(
  "pricing_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    modelPrices: jsonb("model_prices").notNull(),
    usdToInrRate: numeric("usd_to_inr_rate", { precision: 10, scale: 4 }).notNull(),
    markupMultiplier: numeric("markup_multiplier", { precision: 6, scale: 3 }).notNull(),
    minimumCreditsPerAction: integer("minimum_credits_per_action").notNull(),
    /** INR per credit — ₹500 / 10,000 = 0.05 from the base pack (§3.3). */
    creditValueInr: numeric("credit_value_inr", { precision: 10, scale: 4 })
      .notNull()
      .default("0.0500"),
    active: boolean("active").notNull().default(true),
    /** Admin who created this version; null for seeded rows. */
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pricing_config_version_key").on(table.version),
    uniqueIndex("pricing_config_single_active_key")
      .on(table.active)
      .where(sql`${table.active}`),
    check("pricing_config_usd_to_inr_positive", sql`${table.usdToInrRate} > 0`),
    check("pricing_config_markup_positive", sql`${table.markupMultiplier} > 0`),
    check("pricing_config_credit_value_positive", sql`${table.creditValueInr} > 0`),
    check("pricing_config_minimum_non_negative", sql`${table.minimumCreditsPerAction} >= 0`),
  ],
);

/** Top-up packs, admin-editable without a deploy — prd.md §2. */
export const creditPackages = pgTable(
  "credit_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pricePaise: integer("price_paise").notNull(),
    credits: integer("credits").notNull(),
    bonusCredits: integer("bonus_credits").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("credit_packages_price_paise_key").on(table.pricePaise)],
);
