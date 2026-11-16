import { randomUUID } from "node:crypto";
import {
  auditLogs,
  codeRedemptions,
  coupons,
  createDatabase,
  creditLedger,
  referralCodes,
  users,
  type Database,
} from "@resume-pilot/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CODE_ATTEMPTS_PER_HOUR,
  CodeRedemptionError,
  CouponError,
  createCoupon,
  listFlaggedReferrals,
  redeemCode,
  ReferralReviewError,
  reviewFlaggedReferral,
  updateCoupon,
} from "./codes";
import { findWalletMismatches, getWalletPage } from "./ledger";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("coupon and referral codes (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const couponIds: string[] = [];
  let adminId: string;

  async function newUser() {
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email: `codes-${randomUUID()}@example.com`,
    });
    userIds.push(userId);
    return userId;
  }

  async function referralCodeOf(userId: string) {
    const [row] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
    return row!.code;
  }

  async function coupon(input: Partial<Parameters<typeof createCoupon>[2]> = {}) {
    const c = await createCoupon(db, adminId, {
      code: `T${randomUUID().slice(0, 8)}`,
      credits: 500,
      ...input,
    });
    couponIds.push(c.id);
    return c;
  }

  const balance = async (userId: string) => (await getWalletPage(db, userId)).balance;
  const reason = async (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e: unknown) => (e instanceof CodeRedemptionError ? e.reason : String(e)),
    );

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    adminId = await newUser();
    await db.update(users).set({ role: "admin" }).where(eq(users.id, adminId));
  });

  afterAll(async () => {
    await db.delete(users).where(
      inArray(
        users.id,
        userIds.filter((id) => id !== adminId),
      ),
    );
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId));
    await db.delete(codeRedemptions).where(inArray(codeRedemptions.couponId, couponIds));
    await db.delete(coupons).where(inArray(coupons.id, couponIds));
    await db.delete(users).where(eq(users.id, adminId));
    await db.$client.end();
  });

  describe("acceptance 16.2.1", () => {
    it("a coupon (EARLYBIRD-style) grants its credits, case-insensitively, as a linked coupon_credit", async () => {
      const userId = await newUser();
      const c = await coupon({ credits: 500 });

      const result = await redeemCode(db, { userId, code: `  ${c.code.toLowerCase()} ` });

      expect(result).toMatchObject({ codeType: "coupon", creditsToUser: 500, balanceAfter: 500 });
      expect(await balance(userId)).toBe(500);
      const [entry] = await db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
      expect(entry).toMatchObject({
        type: "coupon_credit",
        credits: 500,
        sourceType: "code_redemption",
        sourceId: result.redemptionId,
      });
    });

    it("a referral code grants 100 to the new user and 100 to the referrer, linked to the redemption", async () => {
      const referrer = await newUser();
      const referee = await newUser();

      const result = await redeemCode(db, {
        userId: referee,
        code: (await referralCodeOf(referrer)).toLowerCase(),
        ip: "203.0.113.10",
      });

      expect(result).toMatchObject({
        codeType: "referral",
        creditsToUser: 100,
        referrerStatus: "granted",
      });
      expect(await balance(referee)).toBe(100);
      expect(await balance(referrer)).toBe(100);
      const entries = await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.sourceId, result.redemptionId));
      expect(entries.map((e) => [e.userId, e.type, e.credits, e.sourceType]).sort()).toEqual(
        [
          [referee, "referral_credit", 100, "code_redemption"],
          [referrer, "referral_credit", 100, "code_redemption_referrer"],
        ].sort(),
      );
    });

    it("a referrer earns from any number of referrals", async () => {
      const referrer = await newUser();
      const code = await referralCodeOf(referrer);
      for (let i = 0; i < 3; i++) {
        await redeemCode(db, { userId: await newUser(), code, ip: `198.51.100.${i}` });
      }
      expect(await balance(referrer)).toBe(300);
    });

    it("one code per account: coupon then referral, and referral then coupon, are both refused", async () => {
      const c = await coupon();
      const referrer = await newUser();
      const code = await referralCodeOf(referrer);

      const a = await newUser();
      await redeemCode(db, { userId: a, code: c.code });
      expect(await reason(redeemCode(db, { userId: a, code }))).toBe("already_redeemed");

      const b = await newUser();
      await redeemCode(db, { userId: b, code });
      expect(await reason(redeemCode(db, { userId: b, code: c.code }))).toBe("already_redeemed");
      expect(await balance(b)).toBe(100);
    });

    it("one code per account holds under concurrent redemptions", async () => {
      const userId = await newUser();
      const c1 = await coupon({ credits: 500 });
      const c2 = await coupon({ credits: 700 });

      const results = await Promise.all([
        reason(redeemCode(db, { userId, code: c1.code })),
        reason(redeemCode(db, { userId, code: c2.code })),
      ]);

      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results.filter((r) => r === "already_redeemed")).toHaveLength(1);
      expect([500, 700]).toContain(await balance(userId));
    });

    it("a user can't apply their own referral code", async () => {
      const userId = await newUser();
      expect(await reason(redeemCode(db, { userId, code: await referralCodeOf(userId) }))).toBe(
        "own_code",
      );
      expect(await balance(userId)).toBe(0);
    });
  });

  describe("coupon limits", () => {
    it("refuses unknown, inactive and expired codes", async () => {
      const userId = await newUser();
      const inactive = await coupon({ active: false });
      const expired = await coupon({ expiresAt: new Date(Date.now() - 1000) });

      expect(await reason(redeemCode(db, { userId, code: "NO-SUCH-CODE" }))).toBe("not_found");
      expect(await reason(redeemCode(db, { userId, code: inactive.code }))).toBe("inactive");
      expect(await reason(redeemCode(db, { userId, code: expired.code }))).toBe("expired");
      expect(await balance(userId)).toBe(0);
    });

    it("max redemptions holds under concurrent redemptions by different users", async () => {
      const c = await coupon({ maxRedemptions: 2 });
      const people = await Promise.all([1, 2, 3, 4, 5].map(() => newUser()));

      const results = await Promise.all(
        people.map((userId) => reason(redeemCode(db, { userId, code: c.code }))),
      );

      expect(results.filter((r) => r === "ok")).toHaveLength(2);
      expect(results.filter((r) => r === "exhausted")).toHaveLength(3);
    });

    it("an admin can deactivate a coupon, with an audit entry", async () => {
      const c = await coupon();
      await updateCoupon(db, adminId, c.id, { active: false, reason: "campaign ended" });
      expect(await reason(redeemCode(db, { userId: await newUser(), code: c.code }))).toBe(
        "inactive",
      );
      const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.targetId, c.id));
      expect(audit?.action).toBe("coupon.create");
    });

    it("coupon codes are unique case-insensitively and can't look like referral codes", async () => {
      const c = await coupon();
      await expect(
        createCoupon(db, adminId, { code: c.code.toLowerCase(), credits: 1 }),
      ).rejects.toBeInstanceOf(CouponError);
      await expect(createCoupon(db, adminId, { code: "RP-ABC123", credits: 1 })).rejects.toThrow(
        /RP-/,
      );
      await expect(createCoupon(db, adminId, { code: "a", credits: 1 })).rejects.toBeInstanceOf(
        CouponError,
      );
    });
  });

  describe("rate limit", () => {
    it(`allows ${CODE_ATTEMPTS_PER_HOUR} attempts per hour, wrong codes included`, async () => {
      const userId = await newUser();
      for (let i = 0; i < CODE_ATTEMPTS_PER_HOUR; i++) {
        expect(await reason(redeemCode(db, { userId, code: `WRONG${i}` }))).toBe("not_found");
      }
      const c = await coupon();
      // Even a valid code is refused once the limit is hit.
      expect(await reason(redeemCode(db, { userId, code: c.code }))).toBe("rate_limited");
      // An hour later it works again.
      const later = new Date(Date.now() + 61 * 60 * 1000);
      expect(await reason(redeemCode(db, { userId, code: c.code }, later))).toBe("ok");
    });
  });

  describe("acceptance 16.2.20: flagged referrals", () => {
    it("a repeat from the same IP grants the referee now but holds the referrer until approval", async () => {
      const referrer = await newUser();
      const code = await referralCodeOf(referrer);
      const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;

      const first = await redeemCode(db, { userId: await newUser(), code, ip });
      const secondUser = await newUser();
      const second = await redeemCode(db, { userId: secondUser, code, ip });

      expect(first.referrerStatus).toBe("granted");
      expect(second).toMatchObject({ referrerStatus: "held", creditsToUser: 100 });
      expect(await balance(secondUser)).toBe(100);
      expect(await balance(referrer)).toBe(100); // only the first referral paid

      const queue = await listFlaggedReferrals(db);
      expect(queue).toContainEqual(
        expect.objectContaining({ redemptionId: second.redemptionId, referrerId: referrer, code }),
      );

      const approved = await reviewFlaggedReferral(db, {
        adminUserId: adminId,
        redemptionId: second.redemptionId,
        decision: "approve",
        reason: "verified different people",
      });
      expect(approved).toEqual({ referrerStatus: "granted", balanceAfter: 200 });
      expect(await balance(referrer)).toBe(200);

      // Deciding twice is refused and grants nothing more.
      await expect(
        reviewFlaggedReferral(db, {
          adminUserId: adminId,
          redemptionId: second.redemptionId,
          decision: "approve",
          reason: "again",
        }),
      ).rejects.toBeInstanceOf(ReferralReviewError);
      expect(await balance(referrer)).toBe(200);
      expect((await listFlaggedReferrals(db)).map((r) => r.redemptionId)).not.toContain(
        second.redemptionId,
      );
    });

    it("the same device also flags, and a rejected referral never pays the referrer", async () => {
      const referrer = await newUser();
      const code = await referralCodeOf(referrer);
      const deviceId = randomUUID();

      await redeemCode(db, { userId: await newUser(), code, deviceId, ip: "198.51.100.200" });
      const second = await redeemCode(db, {
        userId: await newUser(),
        code,
        deviceId,
        ip: "198.51.100.201",
      });
      expect(second.referrerStatus).toBe("held");

      const rejected = await reviewFlaggedReferral(db, {
        adminUserId: adminId,
        redemptionId: second.redemptionId,
        decision: "reject",
        reason: "same device",
      });
      expect(rejected).toEqual({ referrerStatus: "rejected", balanceAfter: null });
      expect(await balance(referrer)).toBe(100);
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.targetId, second.redemptionId));
      expect(audit).toMatchObject({ action: "referral.reject", reason: "same device" });
    });

    it("different IPs and devices are not flagged", async () => {
      const referrer = await newUser();
      const code = await referralCodeOf(referrer);
      const a = await redeemCode(db, {
        userId: await newUser(),
        code,
        ip: "203.0.113.50",
        deviceId: randomUUID(),
      });
      const b = await redeemCode(db, {
        userId: await newUser(),
        code,
        ip: "203.0.113.51",
        deviceId: randomUUID(),
      });
      expect([a.referrerStatus, b.referrerStatus]).toEqual(["granted", "granted"]);
    });

    it("stores only hashed IPs and devices", async () => {
      const referrer = await newUser();
      const ip = "203.0.113.99";
      const r = await redeemCode(db, {
        userId: await newUser(),
        code: await referralCodeOf(referrer),
        ip,
      });
      const [row] = await db
        .select()
        .from(codeRedemptions)
        .where(eq(codeRedemptions.id, r.redemptionId));
      expect(row?.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.ipHash).not.toContain(ip);
    });
  });

  describe("consistency", () => {
    it("two users redeeming each other's referral codes at once both succeed (no deadlock)", async () => {
      const a = await newUser();
      const b = await newUser();
      const [ra, rb] = await Promise.all([
        reason(redeemCode(db, { userId: a, code: await referralCodeOf(b), ip: "10.0.0.1" })),
        reason(redeemCode(db, { userId: b, code: await referralCodeOf(a), ip: "10.0.0.2" })),
      ]);
      expect([ra, rb]).toEqual(["ok", "ok"]);
      expect(await balance(a)).toBe(200);
      expect(await balance(b)).toBe(200);
    });

    it("every wallet touched here reconciles with its ledger", async () => {
      expect(await findWalletMismatches(db, userIds)).toEqual([]);
    });
  });
});
