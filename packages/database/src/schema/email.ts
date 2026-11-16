import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  emailCampaignStatusEnum,
  emailMessageStatusEnum,
  emailSuppressionReasonEnum,
} from "./enums";
import { users } from "./users";

/** Per-user switches, Settings -> Notifications — prd.md §13.5. */
export const emailPreferences = pgTable(
  "email_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminders: boolean("reminders").notNull().default(false),
    productUpdates: boolean("product_updates").notNull().default(false),
    offers: boolean("offers").notNull().default(false),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_preferences_user_id_key").on(table.userId)],
);

/** Hard bounce / complaint / unsubscribe-all — prd.md §13.5. */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: emailSuppressionReasonEnum("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_suppressions_lower_email_key").on(sql`lower(${table.email})`)],
);

/** Marketing template on/off + inactive-nudge timing — prd.md §13.3. */
export const emailTemplateSettings = pgTable(
  "email_template_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    settings: jsonb("settings"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_template_settings_template_key_key").on(table.templateKey)],
);

/** Admin campaigns — prd.md §13.4. */
export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateKey: text("template_key").notNull(),
  audienceFilters: jsonb("audience_filters").notNull(),
  subject: text("subject").notNull(),
  preheader: text("preheader"),
  content: jsonb("content").notNull(),
  status: emailCampaignStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  recipientCount: integer("recipient_count"),
  sentCount: integer("sent_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per send — prd.md §13.6. `idempotencyKey` (template key +
 * source id) guarantees every transactional email sends exactly once
 * even under duplicate webhooks or job retries (acceptance criterion
 * 16.2.16). `providerMessageId` is nullable until the SMTP server accepts the send.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateKey: text("template_key").notNull(),
    campaignId: uuid("campaign_id").references(() => emailCampaigns.id),
    status: emailMessageStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    /** Why a send failed or was skipped — shown in the admin email log. */
    error: text("error"),
    idempotencyKey: text("idempotency_key").notNull(),
    mergeData: jsonb("merge_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_messages_idempotency_key_key").on(table.idempotencyKey),
    uniqueIndex("email_messages_provider_message_id_key").on(table.providerMessageId),
  ],
);

/**
 * Raw delivery events (bounces, complaints) — prd.md §13.2, §13.6.
 * Provider-neutral: plain SMTP reports none on its own, so this stays
 * empty until a bounce source is wired up.
 */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").references(() => emailMessages.id),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("email_events_provider_event_id_key").on(table.providerEventId)],
);
