import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** Every admin action with its reason — prd.md §2.2. */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  reason: text("reason").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
