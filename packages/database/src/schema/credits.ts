import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { aiJobs } from "./ai";
import { creditHoldStatusEnum, creditLedgerTypeEnum } from "./enums";
import { users } from "./users";

/**
 * One wallet per user — cached balance, kept in sync with
 * `credit_ledger` inside the same DB transaction as every ledger write
 * (prd.md §3.5). The `balance >= 0` check is enforced here at the DB
 * level, not just in application code (tasks/todo/m1-foundation/03,
 * "Done when").
 */
export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_accounts_user_id_key").on(table.userId),
    check("credit_accounts_balance_non_negative_check", sql`${table.balance} >= 0`),
  ],
);

/** Estimate -> hold -> capture, prd.md §3.4. One hold per AI job. */
export const creditHolds = pgTable(
  "credit_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    aiJobId: uuid("ai_job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: creditHoldStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("credit_holds_ai_job_id_key").on(table.aiJobId)],
);

/**
 * Append-only — never updated or deleted (prd.md §3.5). The unique
 * `(source_type, source_id)` constraint is what makes every credit
 * movement traceable to exactly one AI job, payment, grant or admin
 * action, and makes granting the same source twice impossible even
 * under a retried request.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: creditLedgerTypeEnum("type").notNull(),
    credits: bigint("credits", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_ledger_source_type_source_id_key").on(table.sourceType, table.sourceId),
  ],
);
