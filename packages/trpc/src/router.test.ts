import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@resume-pilot/database";
import { createUserFromClerkWebhook } from "@resume-pilot/services";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "./context";
import { appRouter } from "./router";

describe("appRouter (public procedures)", () => {
  // Public procedures never touch ctx.db, so a connectionless context
  // is fine here — exercised for real by the authed suite below.
  const caller = appRouter.createCaller(createContext({ db: {} as Database, userId: null }));

  it("health returns ok", async () => {
    const result = await caller.health();
    expect(result.status).toBe("ok");
  });

  it("ping echoes input and includes a credits estimate from @resume-pilot/credits", async () => {
    const result = await caller.ping({ message: "hello" });
    expect(result.echo).toBe("hello");
    expect(result.estimate).toEqual({ action: "ping", estimatedCredits: 0 });
  });

  it("ping rejects an empty message via @resume-pilot/validators", async () => {
    await expect(caller.ping({ message: "" })).rejects.toThrow();
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("appRouter (authed procedures, real DB)", () => {
  let db: Database;
  let clerkUserId: string;

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    clerkUserId = `clerk_${randomUUID()}`;
    await createUserFromClerkWebhook(db, { clerkUserId, email: "trpc-test@example.com" });
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("me rejects an unauthenticated caller", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: null }));
    await expect(caller.me()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("me rejects a userId with no matching DB row", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: "clerk_does_not_exist" }));
    await expect(caller.me()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("me resolves the user server-side from a real Clerk-created row", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: clerkUserId }));
    const result = await caller.me();
    expect(result.email).toBe("trpc-test@example.com");
    expect(result.role).toBe("user");
  });

  it("wallet reflects the 0-credit balance and referral code created by the webhook", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: clerkUserId }));
    const result = await caller.wallet();
    expect(result.balance).toBe(0);
    expect(result.referralCode).toMatch(/^RP-[A-Z0-9]{6}$/);
  });
});
