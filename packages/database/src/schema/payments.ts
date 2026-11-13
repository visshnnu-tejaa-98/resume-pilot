import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentStatusEnum } from "./enums.js";
import { creditPackages } from "./pricing.js";
import { users } from "./users.js";

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
