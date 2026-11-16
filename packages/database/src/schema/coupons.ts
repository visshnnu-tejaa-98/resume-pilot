import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { codeTypeEnum, referrerStatusEnum } from "./enums";
import { users } from "./users";

/** Admin-created codes — prd.md §2.1. Code matching is case-insensitive. */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    credits: integer("credits").notNull(),
    maxRedemptions: integer("max_redemptions"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("coupons_lower_code_key").on(sql`lower(${table.code})`)],
);

/** One auto-generated code per user, every user gets one — prd.md §2.1. */
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_codes_user_id_key").on(table.userId),
    uniqueIndex("referral_codes_lower_code_key").on(sql`lower(${table.code})`),
  ],
);

/**
 * One row per user, ever — enforces "one code per account, ever"
 * (prd.md §2.1) at the DB level via the unique `user_id`.
 */
export const codeRedemptions = pgTable(
  "code_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeType: codeTypeEnum("code_type").notNull(),
    couponId: uuid("coupon_id").references(() => coupons.id),
    referralCodeId: uuid("referral_code_id").references(() => referralCodes.id),
    creditsToUser: integer("credits_to_user").notNull(),
    creditsToReferrer: integer("credits_to_referrer").notNull().default(0),
    referrerStatus: referrerStatusEnum("referrer_status").notNull().default("granted"),
    flaggedForAbuse: boolean("flagged_for_abuse").notNull().default(false),
    /** Why the referral was flagged, for the admin review queue. */
    flagReason: text("flag_reason"),
    /**
     * Salted SHA-256 of the client IP / device id at redemption — enough
     * to spot repeats from one source, without storing the raw IP.
     */
    ipHash: text("ip_hash"),
    deviceHash: text("device_hash"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("code_redemptions_user_id_key").on(table.userId),
    index("code_redemptions_referral_ip_idx").on(table.referralCodeId, table.ipHash),
    index("code_redemptions_referral_device_idx").on(table.referralCodeId, table.deviceHash),
    index("code_redemptions_coupon_id_idx").on(table.couponId),
  ],
);

/**
 * Every code a user tries, right or wrong — backs the 5-per-hour rate
 * limit (prd.md §2.1). Failed guesses must count, or brute-forcing
 * codes would be free.
 */
export const codeAttempts = pgTable(
  "code_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    succeeded: boolean("succeeded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("code_attempts_user_created_idx").on(table.userId, table.createdAt)],
);
