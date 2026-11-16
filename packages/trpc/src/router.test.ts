import { randomUUID } from "node:crypto";
import {
  createDatabase,
  referralCodes,
  resumeFiles,
  resumes,
  users,
  type Database,
} from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { createUserFromClerkWebhook, grantCredits } from "@resume-pilot/services";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const extractionAdd = vi.hoisted(() => vi.fn());
vi.mock("@resume-pilot/queue", async (orig) => ({
  ...(await orig<typeof import("@resume-pilot/queue")>()),
  getExtractionQueue: () => ({ add: extractionAdd, getJob: async () => undefined }),
}));

vi.mock("@resume-pilot/storage", async (orig) => {
  const real = await orig<typeof import("@resume-pilot/storage")>();
  // Real ownership check, fake signing: no ImageKit credentials in tests.
  const storage = real.createImageKitStorage(
    { privateKey: "test", urlEndpoint: "https://ik.example" },
    {
      files: { upload: vi.fn(), delete: vi.fn() },
      helper: { buildSrc: (o: { src: string }) => `https://ik.example${o.src}?ik-s=sig` },
    } as never,
  );
  return { ...real, getStorage: () => storage };
});
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
    expect(result.held).toBe(0);
    expect(result.available).toBe(0);
    expect(result.referralCode).toMatch(/^RP-[A-Z0-9]{6}$/);
  });

  it("walletHistory returns only the caller's own wallet, with defaults", async () => {
    const other = `clerk_${randomUUID()}`;
    const { userId: otherId } = await createUserFromClerkWebhook(db, {
      clerkUserId: other,
      email: "trpc-other@example.com",
    });
    await grantCredits(db, {
      userId: otherId,
      type: "purchase",
      credits: 10_000,
      sourceType: "payment",
      sourceId: randomUUID(),
    });

    const caller = appRouter.createCaller(createContext({ db, userId: clerkUserId }));
    const page = await caller.walletHistory();
    expect(page).toMatchObject({ balance: 0, held: 0, history: [], nextCursor: null });

    await expect(caller.walletHistory({ limit: 500 })).rejects.toThrow();
    await expect(caller.walletHistory({ cursor: "not-a-uuid" })).rejects.toThrow();
    await db.delete(users).where(eq(users.id, otherId));
  });

  it("walletHistory rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: null }));
    await expect(caller.walletHistory()).rejects.toThrow(/UNAUTHORIZED/);
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
      actionSettings: {
        jd_analysis: { model: "gpt-5.1", promptOverheadTokens: 1500, maxOutputTokens: 2000 },
        generation: { model: "gpt-5.1", promptOverheadTokens: 2500, maxOutputTokens: 6000 },
        ats_scoring: { model: "gpt-5.1", promptOverheadTokens: 2000, maxOutputTokens: 2500 },
      },
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

describe.skipIf(!connectionString)("appRouter codes (real DB)", () => {
  let db: Database;
  let userClerkId: string;
  let otherUserId: string;
  const ids: string[] = [];

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    userClerkId = `clerk_${randomUUID()}`;
    const u = await createUserFromClerkWebhook(db, {
      clerkUserId: userClerkId,
      email: "codes-u@example.com",
    });
    const o = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: "codes-o@example.com",
    });
    otherUserId = o.userId;
    ids.push(u.userId, o.userId);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, ids));
    await db.$client.end();
  });

  it("redeemCode applies a referral code to the caller's own wallet", async () => {
    const [ref] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, otherUserId));
    const caller = appRouter.createCaller(
      createContext({ db, userId: userClerkId, clientIp: "203.0.113.1" }),
    );

    const result = await caller.redeemCode({ code: ref!.code });
    expect(result).toMatchObject({ codeType: "referral", creditsToUser: 100 });
    expect((await caller.wallet()).balance).toBe(100);
  });

  it("maps code errors to BAD_REQUEST with the user-facing message", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    await expect(caller.redeemCode({ code: "WHATEVER" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/isn't valid|already used/),
    });
  });

  it("rejects an empty code before touching the database", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    await expect(caller.redeemCode({ code: "   " })).rejects.toThrow();
  });

  it("admin code procedures are forbidden to regular users", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: userClerkId }));
    await expect(caller.admin.codes.listCoupons()).rejects.toThrow(/FORBIDDEN/);
    await expect(caller.admin.codes.flaggedReferrals()).rejects.toThrow(/FORBIDDEN/);
    await expect(
      caller.admin.codes.createCoupon({ code: "HACKED", credits: 1_000_000 }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe.skipIf(!connectionString)("appRouter.resumes (real DB)", () => {
  let db: Database;
  const owner = `clerk_${randomUUID()}`;
  const intruder = `clerk_${randomUUID()}`;
  const ids: string[] = [];
  let resumeId: string;

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    const o = await createUserFromClerkWebhook(db, {
      clerkUserId: owner,
      email: "res-owner@example.com",
    });
    const i = await createUserFromClerkWebhook(db, {
      clerkUserId: intruder,
      email: "res-intruder@example.com",
    });
    ids.push(o.userId, i.userId);
    const key = `/users/${o.userId}/uploads/${randomUUID()}.pdf`;
    const [r] = await db
      .insert(resumes)
      .values({
        userId: o.userId,
        fileKey: key,
        fileName: "cv.pdf",
        fileFormat: "pdf",
        fileHash: randomUUID(),
      })
      .returning();
    resumeId = r!.id;
    await db.insert(resumeFiles).values({
      resumeId,
      pageIndex: 0,
      storageKey: key,
      storageFileId: "file_1",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, ids));
    await db.$client.end();
  });

  it("the owner gets their resume and a signed URL for its file", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: owner }));
    expect((await caller.resumes.list()).map((r) => r.id)).toEqual([resumeId]);
    const urls = await caller.resumes.fileUrls({ resumeId });
    expect(urls).toEqual([
      expect.objectContaining({ pageIndex: 0, url: expect.stringContaining("ik-s=") }),
    ]);
  });

  it("retryExtraction re-queues a failed resume for its owner only", async () => {
    await db
      .update(resumes)
      .set({ status: "failed", extractionError: "x" })
      .where(eq(resumes.id, resumeId));
    extractionAdd.mockReset();

    const other = appRouter.createCaller(createContext({ db, userId: intruder }));
    await expect(other.resumes.retryExtraction({ resumeId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(extractionAdd).not.toHaveBeenCalled();

    const caller = appRouter.createCaller(createContext({ db, userId: owner }));
    expect(await caller.resumes.retryExtraction({ resumeId })).toEqual({ status: "uploaded" });
    expect(extractionAdd).toHaveBeenCalledWith("extract", { resumeId }, expect.anything());
    // Already uploaded again, so a second retry is refused.
    await expect(caller.resumes.retryExtraction({ resumeId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("retryExtraction re-runs only the JSON step when the raw text already exists", async () => {
    await db
      .update(resumes)
      .set({ status: "failed", extractionError: "x", rawText: "Priya Raman resume text" })
      .where(eq(resumes.id, resumeId));
    extractionAdd.mockReset();

    const caller = appRouter.createCaller(createContext({ db, userId: owner }));
    expect(await caller.resumes.retryExtraction({ resumeId })).toEqual({ status: "processed" });
    expect(extractionAdd).toHaveBeenCalledWith(
      "structure",
      { resumeId },
      expect.objectContaining({ jobId: `structure-${resumeId}` }),
    );
    await db.update(resumes).set({ rawText: null }).where(eq(resumes.id, resumeId));
  });

  it("original returns NOT_FOUND until the resume is parsed, and to anyone but the owner", async () => {
    const owned = appRouter.createCaller(createContext({ db, userId: owner }));
    await expect(owned.resumes.original({ resumeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("another user gets NOT_FOUND for the same resume id, and sees no resumes", async () => {
    const caller = appRouter.createCaller(createContext({ db, userId: intruder }));
    await expect(caller.resumes.fileUrls({ resumeId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await caller.resumes.list()).toEqual([]);
  });
});
