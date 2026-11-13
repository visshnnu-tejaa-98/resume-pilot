import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Model prices, FX rate, markup, minimums — versioned (prd.md §3.3,
 * §3.6). Every `ai_jobs` row records which version it used.
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
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("pricing_config_version_key").on(table.version)],
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
