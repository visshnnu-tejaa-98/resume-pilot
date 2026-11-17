import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentStatusEnum, refundStatusEnum } from "./enums";
import { creditPackages } from "./pricing";
import { users } from "./users";

/** Razorpay orders and payments — prd.md §11.1, §11.3. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: uuid("package_id").references(() => creditPackages.id),
    orderId: text("order_id").notNull(),
    paymentId: text("payment_id"),
    amountPaise: integer("amount_paise").notNull(),
    credits: integer("credits").notNull(),
    status: paymentStatusEnum("status").notNull().default("created"),
    /** "upi", "card", "netbanking", … from Razorpay, for the receipt. */
    method: text("method"),
    /** When credits were granted (start of the 6-month refund window, §11.2). */
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    /** Razorpay's description when a payment fails. */
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payments_order_id_key").on(table.orderId),
    uniqueIndex("payments_payment_id_key").on(table.paymentId),
  ],
);

/** Raw webhook events, idempotent handling keyed on `event_id` — prd.md §11.3. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").references(() => payments.id),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("payment_events_event_id_key").on(table.eventId)],
);

/**
 * Admin-initiated refunds of unused purchased credits — prd.md §11.2.
 * One per payment. The ledger debit (source `refund`/<id>) is written in
 * the same transaction that creates this row, before Razorpay is called;
 * `pending` rows are retried until Razorpay accepts them.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adminUserId: uuid("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    credits: integer("credits").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    /** Razorpay refund id (rfnd_…), once Razorpay accepts it. */
    razorpayRefundId: text("razorpay_refund_id"),
    reason: text("reason").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refunds_payment_id_key").on(table.paymentId),
    uniqueIndex("refunds_razorpay_refund_id_key").on(table.razorpayRefundId),
    check("refunds_positive_check", sql`${table.credits} > 0 and ${table.amountPaise} > 0`),
  ],
);
