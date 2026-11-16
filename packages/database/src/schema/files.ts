import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { resumeVersions } from "./resumes";

/** The 5 Phase-1 templates — prd.md §10.2. */
export const resumeTemplates = pgTable(
  "resume_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("resume_templates_key_key").on(table.key)],
);

/** PDFs in ImageKit, cached by content hash + template — prd.md §10.3. */
export const generatedFiles = pgTable(
  "generated_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => resumeTemplates.id),
    contentHash: text("content_hash").notNull(),
    /** File path in ImageKit (provider-neutral name). */
    storageKey: text("storage_key").notNull(),
    /** ImageKit fileId — needed to delete the file. */
    storageFileId: text("storage_file_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("generated_files_version_hash_template_key").on(
      table.versionId,
      table.contentHash,
      table.templateId,
    ),
  ],
);
