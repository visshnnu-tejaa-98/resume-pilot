import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    companyName: text("company_name"),
    jobTitle: text("job_title"),
    postingUrl: text("posting_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // prd.md §7.1: 200 to 30,000 characters after trimming whitespace.
    check(
      "job_descriptions_text_length_check",
      sql`char_length(btrim(${table.text})) between 200 and 30000`,
    ),
  ],
);

/** Cached per `jdId` — prd.md §7.2. */
export const jdAnalyses = pgTable(
  "jd_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: "cascade" }),
    jobTitle: text("job_title"),
    seniority: text("seniority"),
    minYearsExperience: integer("min_years_experience"),
    requirements: jsonb("requirements").notNull(),
    educationRequirements: jsonb("education_requirements"),
    domainTerms: jsonb("domain_terms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("jd_analyses_jd_id_key").on(table.jdId)],
);
