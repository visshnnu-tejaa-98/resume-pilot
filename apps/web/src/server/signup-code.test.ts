import { randomUUID } from "node:crypto";
import { coupons, createDatabase, users, type Database } from "@resume-pilot/database";
import { createUserFromClerkWebhook, getWalletSummary } from "@resume-pilot/services";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const updateUserMetadata = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser, updateUserMetadata } }),
}));

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("applySignupCodeOnce (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const couponCode = `SIGNUP${randomUUID().slice(0, 6).toUpperCase()}`;

  async function newUser() {
    const clerkUserId = `clerk_${randomUUID()}`;
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId,
      email: `signup-code-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return { userId, clerkUserId };
  }

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    await db.insert(coupons).values({ code: couponCode, credits: 500 });
  });

  beforeEach(() => {
    getUser.mockReset();
    updateUserMetadata.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(coupons).where(eq(coupons.code, couponCode));
    await db.$client.end();
  });

  it("applies the code from sign-up once, then clears it from Clerk metadata", async () => {
    const { applySignupCodeOnce } = await import("./signup-code");
    const { userId, clerkUserId } = await newUser();
    getUser.mockResolvedValue({
      unsafeMetadata: { referralCodeAtSignup: couponCode.toLowerCase(), theme: "x" },
    });

    const outcome = await applySignupCodeOnce({ userId, clerkUserId, ip: "203.0.113.7" });

    expect(outcome).toEqual({ status: "applied", credits: 500 });
    expect((await getWalletSummary(db, userId)).balance).toBe(500);
    expect(updateUserMetadata).toHaveBeenCalledWith(clerkUserId, {
      unsafeMetadata: { theme: "x", referralCodeAtSignup: null },
    });

    // Next dashboard load: already redeemed, no Clerk call at all.
    getUser.mockClear();
    expect(await applySignupCodeOnce({ userId, clerkUserId, ip: null })).toEqual({
      status: "none",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("reports a bad code and still clears it, so it isn't retried every load", async () => {
    const { applySignupCodeOnce } = await import("./signup-code");
    const { userId, clerkUserId } = await newUser();
    getUser.mockResolvedValue({ unsafeMetadata: { referralCodeAtSignup: "NOT-A-CODE" } });

    const outcome = await applySignupCodeOnce({ userId, clerkUserId, ip: null });

    expect(outcome).toEqual({ status: "rejected", message: "That code isn't valid." });
    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    expect((await getWalletSummary(db, userId)).balance).toBe(0);
  });

  it("does nothing when no code was entered at sign-up", async () => {
    const { applySignupCodeOnce } = await import("./signup-code");
    const { userId, clerkUserId } = await newUser();
    getUser.mockResolvedValue({ unsafeMetadata: {} });

    expect(await applySignupCodeOnce({ userId, clerkUserId, ip: null })).toEqual({
      status: "none",
    });
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });
});
