import {
  type AnyPgColumn,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { resumeFormatEnum, resumeStatusEnum, resumeVersionKindEnum } from "./enums.js";
import { jobDescriptions } from "./job-descriptions.js";
import { resumeTemplates } from "./files.js";
import { users } from "./users.js";

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileFormat: resumeFormatEnum("file_format").notNull(),
    fileHash: text("file_hash").notNull(),
    status: resumeStatusEnum("status").notNull().default("uploaded"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("resumes_user_id_file_hash_key").on(table.userId, table.fileHash)],
);

/**
 * `content`/`extractionMeta`/`provenance` store Resume JSON 2.0 and its
 * side-tables — prd.md §6. Validated application-side against the Zod
 * schema in `@resume-pilot/validators` (tasks/todo/m4-schema-extraction),
 * not at the DB layer: Postgres jsonb has no schema of its own.
 */
export const resumeVersions = pgTable("resume_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resumeId: uuid("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  kind: resumeVersionKindEnum("kind").notNull(),
  content: jsonb("content").notNull(),
  extractionMeta: jsonb("extraction_meta"),
  provenance: jsonb("provenance"),
  // Self-referential FK: the snapshot a generated version was built
  // from. The `AnyPgColumn` return type avoids a circular
  // type-inference issue Drizzle has with self-references.
  parentVersionId: uuid("parent_version_id").references((): AnyPgColumn => resumeVersions.id),
  jdId: uuid("jd_id").references(() => jobDescriptions.id),
  contentHash: text("content_hash").notNull(),
  templateId: uuid("template_id").references(() => resumeTemplates.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
