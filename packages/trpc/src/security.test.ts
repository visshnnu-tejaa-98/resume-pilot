import { randomUUID } from "node:crypto";
import { createDatabase, users, type Database } from "@resume-pilot/database";
import { createUserFromClerkWebhook } from "@resume-pilot/services";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No Redis / ImageKit in this suite: these tests must fail on auth, before any side effect.
vi.mock("@resume-pilot/queue", async (orig) => ({
  ...(await orig<typeof import("@resume-pilot/queue")>()),
  getExtractionQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getAiQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getPdfQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getTransactionalEmailQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
  getMarketingEmailQueue: () => ({ add: vi.fn(), getJob: async () => undefined }),
}));

import { createContext } from "./context";
import { appRouter } from "./router";

/**
 * prd.md §15 / CLAUDE.md multi-tenancy: every procedure resolves the user
 * server-side; admin procedures use adminProcedure. These tests walk the
 * whole router, so a procedure added later without the right guard fails here.
 */

/** The only procedures anyone may call without signing in. */
const PUBLIC = new Set(["health", "ping"]);

const paths = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures).sort();

/** Calls `path` on a caller with an empty input; resolves to the tRPC error code, or "OK". */
async function codeOf(caller: unknown, path: string): Promise<string> {
  const fn = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], caller) as (i?: unknown) => Promise<unknown>;
  try {
    await fn({});
    return "OK";
  } catch (err) {
    return (err as { code?: string }).code ?? `THREW ${(err as Error).message}`;
  }
}

describe("router inventory", () => {
  it("finds the procedures (sanity check for the walkers below)", () => {
    expect(paths.length).toBeGreaterThan(50);
    for (const p of PUBLIC) expect(paths).toContain(p);
  });
});

describe("every non-public procedure rejects anonymous callers", () => {
  // A fake db: if any procedure got past auth it would crash on it rather than read data.
  const anon = appRouter.createCaller(createContext({ db: {} as Database, userId: null }));
  it.each(paths.filter((p) => !PUBLIC.has(p)))("%s → UNAUTHORIZED", async (path) => {
    expect(await codeOf(anon, path)).toBe("UNAUTHORIZED");
  });
});

describe("a forged or unknown user id is never trusted", () => {
  const forged = appRouter.createCaller(createContext({ db: {} as Database, userId: "" }));
  it.each(["me", "resumes.list", "admin.pricing.active"].filter((p) => paths.includes(p)))("empty user id on %s → UNAUTHORIZED", async (path) => {
    expect(await codeOf(forged, path)).toBe("UNAUTHORIZED");
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("every admin procedure is forbidden to regular users (real DB)", () => {
  let db: Database;
  let userClerkId: string;
  const created: string[] = [];

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    userClerkId = `clerk_${randomUUID()}`;
    const u = await createUserFromClerkWebhook(db, { clerkUserId: userClerkId, email: `sec-${randomUUID()}@example.com` });
    created.push(u.userId);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, created));
    await db.$client.end();
  });

  const adminPaths = paths.filter((p) => p.startsWith("admin."));

  it("there are admin procedures to check", () => {
    expect(adminPaths.length).toBeGreaterThan(10);
  });

  it.each(adminPaths)("%s → FORBIDDEN for a regular user", async (path) => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    expect(await codeOf(caller, path)).toBe("FORBIDDEN");
  });

  it("a user whose role is changed to admin in the DB gains access — the role is read server-side, per request", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    await db.update(users).set({ role: "admin" }).where(eq(users.clerkUserId, userClerkId));
    expect(await codeOf(caller, "admin.pricing.active")).not.toBe("FORBIDDEN");
    await db.update(users).set({ role: "user" }).where(eq(users.clerkUserId, userClerkId));
    expect(await codeOf(caller, "admin.pricing.active")).toBe("FORBIDDEN");
  });
});
