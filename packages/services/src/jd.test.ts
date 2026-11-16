import { randomUUID } from "node:crypto";
import { createDatabase, jobDescriptions, users, type Database } from "@resume-pilot/database";
import { JD_TEXT_MAX, JD_TEXT_MIN, jdInputSchema } from "@resume-pilot/validators";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobDescription,
  getJobDescription,
  JdNotFoundError,
  listJobDescriptions,
  reviseJobDescription,
} from "./jd";
import { createUserFromClerkWebhook } from "./user";

const JD = "Frontend engineer. ".repeat(15); // 285 chars

describe("jdInputSchema", () => {
  it("counts length after trimming", () => {
    const pad = " ".repeat(500);
    expect(jdInputSchema.safeParse({ text: pad + "x".repeat(JD_TEXT_MIN - 1) + pad }).success).toBe(false);
    expect(jdInputSchema.safeParse({ text: pad + "x".repeat(JD_TEXT_MIN) + pad }).success).toBe(true);
    expect(jdInputSchema.safeParse({ text: "x".repeat(JD_TEXT_MAX) }).success).toBe(true);
  });
  it("only accepts http(s) posting links; blanks become null", () => {
    expect(jdInputSchema.safeParse({ text: JD, postingUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(jdInputSchema.parse({ text: JD, postingUrl: " ", companyName: "" })).toMatchObject({
      postingUrl: null,
      companyName: null,
    });
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("job descriptions (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  async function user() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `jd-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return userId;
  }

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  afterAll(async () => {
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  });

  it("done-when (16.2.7): over 30,000 chars is rejected server-side, by the service and the DB", async () => {
    const userId = await user();
    await expect(
      createJobDescription(db, userId, { text: "x".repeat(JD_TEXT_MAX + 1) }),
    ).rejects.toThrow(/at most/);
    // Even a caller that skips the service can't store it.
    await expect(
      db.insert(jobDescriptions).values({ userId, text: "x".repeat(JD_TEXT_MAX + 1) }),
    ).rejects.toThrow();
    const [{ n }] = (await db.execute(
      sql`select count(*)::int as n from job_descriptions where user_id = ${userId}`,
    )) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });

  it("saves trimmed text with optional details and lists only the user's own", async () => {
    const userId = await user();
    const other = await user();
    const jd = await createJobDescription(db, userId, {
      text: `  ${JD}  `,
      companyName: "Acme",
      postingUrl: "https://acme.example/jobs/1",
    });
    expect(jd).toMatchObject({ text: JD.trim(), companyName: "Acme", jobTitle: null });
    expect(await listJobDescriptions(db, userId)).toEqual([
      expect.objectContaining({ id: jd.id, preview: JD.trim().slice(0, 160) }),
    ]);
    expect(await listJobDescriptions(db, other)).toEqual([]);
    await expect(getJobDescription(db, { userId: other, jdId: jd.id })).rejects.toBeInstanceOf(
      JdNotFoundError,
    );
  });

  it("editing creates a new record and leaves the old one untouched", async () => {
    const userId = await user();
    const jd = await createJobDescription(db, userId, { text: JD });

    const same = await reviseJobDescription(db, { userId, jdId: jd.id, text: ` ${JD} ` });
    expect(same).toMatchObject({ id: jd.id, created: false });

    const edited = await reviseJobDescription(db, { userId, jdId: jd.id, text: JD + "Also React." });
    expect(edited.created).toBe(true);
    expect(edited.id).not.toBe(jd.id);
    expect((await getJobDescription(db, { userId, jdId: jd.id })).text).toBe(JD.trim());
    expect(await listJobDescriptions(db, userId)).toHaveLength(2);
  });
});
