import { jdAnalyses, jobDescriptions, type Database } from "@resume-pilot/database";
import { jdInputSchema, type JdInput } from "@resume-pilot/validators";
import { and, desc, eq, sql } from "drizzle-orm";

/**
 * Saved job descriptions — prd.md §7.1. Free to save; analysis (and its
 * credit charge) happens later, after the user confirms an estimate.
 *
 * JD rows are never edited in place: changing the text creates a new
 * record, so generated versions and ATS scores keep pointing at the JD
 * they were built from (and its cached analysis).
 */

export class JdNotFoundError extends Error {
  constructor() {
    super("Job description not found");
    this.name = "JdNotFoundError";
  }
}

const columns = {
  id: jobDescriptions.id,
  text: jobDescriptions.text,
  companyName: jobDescriptions.companyName,
  jobTitle: jobDescriptions.jobTitle,
  postingUrl: jobDescriptions.postingUrl,
  createdAt: jobDescriptions.createdAt,
};

export async function createJobDescription(db: Database, userId: string, input: JdInput) {
  // Re-validated here regardless of the caller: the server is the limit's real gate.
  const data = jdInputSchema.parse(input);
  const [row] = await db
    .insert(jobDescriptions)
    .values({ userId, ...data })
    .returning(columns);
  return row!;
}

export async function getJobDescription(db: Database, input: { userId: string; jdId: string }) {
  const [row] = await db
    .select(columns)
    .from(jobDescriptions)
    .where(and(eq(jobDescriptions.id, input.jdId), eq(jobDescriptions.userId, input.userId)));
  if (!row) throw new JdNotFoundError();
  return row;
}

export async function listJobDescriptions(db: Database, userId: string) {
  return db
    .select({
      id: jobDescriptions.id,
      companyName: jobDescriptions.companyName,
      jobTitle: jobDescriptions.jobTitle,
      postingUrl: jobDescriptions.postingUrl,
      createdAt: jobDescriptions.createdAt,
      preview: sql<string>`left(btrim(${jobDescriptions.text}), 160)`,
      chars: sql<number>`char_length(btrim(${jobDescriptions.text}))`.mapWith(Number),
      /** Whether the cached JD analysis exists yet (prd.md §7.2). */
      analysed: sql<boolean>`exists (select 1 from ${jdAnalyses} where ${jdAnalyses.jdId} = ${jobDescriptions.id})`.mapWith(Boolean),
      /** The analysis's requirements (for headline keywords on job cards); null until analysed. */
      requirements: sql<unknown>`(select ${jdAnalyses.requirements} from ${jdAnalyses} where ${jdAnalyses.jdId} = ${jobDescriptions.id})`,
    })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.userId, userId))
    .orderBy(desc(jobDescriptions.createdAt));
}

/**
 * "Edit" a JD: unchanged details just return the existing record; any
 * change saves a new one. The old record is left untouched.
 */
export async function reviseJobDescription(
  db: Database,
  input: { userId: string; jdId: string } & JdInput,
) {
  const { userId, jdId, ...rest } = input;
  const existing = await getJobDescription(db, { userId, jdId });
  const data = jdInputSchema.parse(rest);
  const unchanged =
    existing.text.trim() === data.text &&
    existing.companyName === data.companyName &&
    existing.jobTitle === data.jobTitle &&
    existing.postingUrl === data.postingUrl;
  if (unchanged) return { ...existing, created: false };
  return { ...(await createJobDescription(db, userId, data)), created: true };
}
