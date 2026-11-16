import { randomUUID } from "node:crypto";
import { createDatabase, users, type Database } from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
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

describe.skipIf(!connectionString)("appRouter.admin.pricing (real DB)", () => {
  let db: Database;
  let userClerkId: string;
  let adminClerkId: string;
  const createdUserIds: string[] = [];

  const validInput = {
    config: {
      modelPrices: { "gpt-5.1": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 } },
      usdToInrRate: 83,
      markupMultiplier: 3,
      minimumCreditsPerAction: 50,
      creditValueInr: 0.05,
    },
    reason: "should never be written",
  };

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    userClerkId = `clerk_${randomUUID()}`;
    adminClerkId = `clerk_${randomUUID()}`;
    const u = await createUserFromClerkWebhook(db, {
      clerkUserId: userClerkId,
      email: "u@example.com",
    });
    const a = await createUserFromClerkWebhook(db, {
      clerkUserId: adminClerkId,
      email: "a@example.com",
    });
    createdUserIds.push(u.userId, a.userId);
    await db.update(users).set({ role: "admin" }).where(eq(users.id, a.userId));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.$client.end();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: null }));
    await expect(caller.admin.pricing.active()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it("forbids regular users from reading or changing pricing", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    await expect(caller.admin.pricing.active()).rejects.toThrow(/FORBIDDEN/);
    await expect(caller.admin.pricing.list()).rejects.toThrow(/FORBIDDEN/);
    await expect(caller.admin.pricing.createVersion(validInput)).rejects.toThrow(/FORBIDDEN/);
  });

  it("lets admins read the active config and history", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: adminClerkId }));
    const active = await caller.admin.pricing.active();
    expect(active.active).toBe(true);
    const list = await caller.admin.pricing.list();
    expect(list.some((c) => c.version === active.version)).toBe(true);
  });

  it("validates input before writing anything", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: adminClerkId }));
    const before = (await caller.admin.pricing.list()).length;
    const bad = [
      { ...validInput, config: { ...validInput.config, markupMultiplier: 0 } },
      { ...validInput, config: { ...validInput.config, modelPrices: {} } },
      { ...validInput, config: { ...validInput.config, minimumCreditsPerAction: 1.5 } },
      { ...validInput, reason: "" },
    ];
    for (const input of bad) {
      await expect(caller.admin.pricing.createVersion(input)).rejects.toThrow();
    }
    expect((await caller.admin.pricing.list()).length).toBe(before);
  });
});
