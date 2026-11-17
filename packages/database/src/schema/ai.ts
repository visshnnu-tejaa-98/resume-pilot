import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { aiJobStatusEnum, aiJobTypeEnum, atsReportStatusEnum } from "./enums";
import { jobDescriptions } from "./job-descriptions";
import { pricingConfig } from "./pricing";
import { resumeVersions } from "./resumes";
import { users } from "./users";

/** Every AI action — prd.md §14.3, charged per §3.2. */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: aiJobTypeEnum("type").notNull(),
    status: aiJobStatusEnum("status").notNull().default("pending"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costPaise: integer("cost_paise"),
    creditsEstimated: integer("credits_estimated").notNull(),
    creditsCharged: integer("credits_charged"),
    /** Config the estimate/charge was computed under — required (prd.md §3.3). */
    pricingConfigVersion: integer("pricing_config_version")
      .notNull()
      .references(() => pricingConfig.version),
    idempotencyKey: text("idempotency_key").notNull(),
    error: text("error"),
    /** What the job runs on (e.g. sourceVersionId, jdId) — for progress pages and admin. */
    input: jsonb("input"),
    /** The resume version a generation produced (prd.md §8.1 step 6). */
    resultVersionId: uuid("result_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ai_jobs_idempotency_key_key").on(table.idempotencyKey)],
);

/**
 * Score computed in code from AI-extracted matches — prd.md §9.1. Cache
 * key is `(versionId content hash, jdId)`: re-scoring unchanged content
 * against the same JD reuses the current report at no charge (§3.2).
 */
export const atsReports = pgTable(
  "ats_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    // Reports go with their JD (and the user's account) — otherwise deleting a user fails.
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    methodVersion: text("method_version").notNull(),
    overallScore: integer("overall_score").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    report: jsonb("report").notNull(),
    status: atsReportStatusEnum("status").notNull().default("current"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ats_reports_version_hash_jd_idx").on(table.versionId, table.contentHash, table.jdId),
  ],
);
