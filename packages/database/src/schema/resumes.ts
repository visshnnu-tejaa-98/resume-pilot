import { sql } from "drizzle-orm";
import {
  integer,
  type AnyPgColumn,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { resumeFormatEnum, resumeStatusEnum, resumeVersionKindEnum } from "./enums";
import { jobDescriptions } from "./job-descriptions";
import { resumeTemplates } from "./files";
import { users } from "./users";

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Storage key of the first file; every file (incl. extra image pages) is in `resume_files`. */
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileFormat: resumeFormatEnum("file_format").notNull(),
    fileHash: text("file_hash").notNull(),
    status: resumeStatusEnum("status").notNull().default("uploaded"),
    /** Plain text from extraction (prd.md §5.3 step 3); input to the JSON step (M4). */
    rawText: text("raw_text"),
    /** How each page was read: text layer / OCR (with confidence) / docx / latex. */
    extractionMeta: jsonb("extraction_meta"),
    /** User-facing reason when status is `failed`. */
    extractionError: text("extraction_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("resumes_user_id_file_hash_key").on(table.userId, table.fileHash)],
);

/**
 * The stored files behind one upload, in page order: one row for a
 * PDF/DOCX/TeX, up to five for images (prd.md §5.1). `storage_file_id`
 * is cleared when the 30-day cleanup deletes the file (§5.2).
 */
export const resumeFiles = pgTable(
  "resume_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    pageIndex: integer("page_index").notNull(),
    storageKey: text("storage_key").notNull(),
    storageFileId: text("storage_file_id"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("resume_files_resume_page_key").on(table.resumeId, table.pageIndex)],
);

/**
 * `content`/`extractionMeta`/`provenance` store Resume JSON 2.0 and its
 * side-tables — prd.md §6. Validated application-side against the Zod
 * schema in `@resume-pilot/validators` (tasks/todo/m4-schema-extraction),
 * not at the DB layer: Postgres jsonb has no schema of its own.
 */
export const resumeVersions = pgTable(
  "resume_versions",
  {
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
  },
  (table) => [
    // One original per upload: retried extraction jobs can't save twice.
    uniqueIndex("resume_versions_one_original_key")
      .on(table.resumeId)
      .where(sql`${table.kind} = 'original'`),
  ],
);
