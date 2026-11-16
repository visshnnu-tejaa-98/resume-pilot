import { createHash } from "node:crypto";
import { REFERRAL_REWARD_CREDITS } from "@resume-pilot/credits";
import {
  auditLogs,
  codeAttempts,
  codeRedemptions,
  coupons,
  creditAccounts,
  referralCodes,
  users,
  type Database,
} from "@resume-pilot/database";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "./db-types";
import { postLedgerEntry } from "./ledger";

/**
 * Coupon and referral codes — prd.md §2.1.
 *
 * - Codes are case-insensitive; one code per account, ever (unique
 *   `code_redemptions.user_id`); a user can't apply their own code.
 * - Coupon: `coupon_credit` ledger entry linked to the redemption.
 * - Referral: 100 to the referee and 100 to the referrer, in one
 *   transaction, as two `referral_credit` entries linked to the
 *   redemption. If abuse checks flag it, the referee still gets theirs
 *   and the referrer's is held until an admin approves (16.2.20).
 * - Max 5 attempts per hour per user, wrong codes included.
 */

export const CODE_ATTEMPTS_PER_HOUR = 5;
/**
 * A referral is flagged when this many earlier redemptions of the same
 * referral code came from the same IP or device. 1 = the second
 * redemption from one source is already suspicious.
 */
export const REFERRAL_FLAG_REPEATS = 1;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Ledger source types for the two sides of a referral (one row each per redemption). */
const REFEREE_SOURCE = "code_redemption" as const;
const REFERRER_SOURCE = "code_redemption_referrer" as const;

export type CodeErrorReason =
  | "not_found"
  | "inactive"
  | "expired"
  | "exhausted"
  | "own_code"
  | "already_redeemed"
  | "rate_limited";

const MESSAGES: Record<CodeErrorReason, string> = {
  not_found: "That code isn't valid.",
  inactive: "That code is no longer active.",
  expired: "That code has expired.",
  exhausted: "That code has reached its redemption limit.",
  own_code: "You can't apply your own referral code.",
  already_redeemed: "You've already used a code on this account. Only one code per account.",
  rate_limited: "Too many attempts. Try again in an hour.",
};

export class CodeRedemptionError extends Error {
  constructor(readonly reason: CodeErrorReason) {
    super(MESSAGES[reason]);
    this.name = "CodeRedemptionError";
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Salted hash for IPs and device ids, so repeats can be matched without
 * storing raw identifiers. Salt from `ABUSE_HASH_SALT` (set in prod).
 */
export function hashIdentifier(
  value: string | null | undefined,
  salt = process.env.ABUSE_HASH_SALT ?? "",
): string | null {
  const v = value?.trim();
  if (!v) return null;
  return createHash("sha256").update(`${salt}:${v}`).digest("hex");
}

export interface RedeemCodeInput {
  userId: string;
  code: string;
  /** Raw client IP and device id; hashed before storage. */
  ip?: string | null;
  deviceId?: string | null;
}

export interface RedeemCodeResult {
  redemptionId: string;
  codeType: "coupon" | "referral";
  creditsToUser: number;
  balanceAfter: number;
  /** Referral only: whether the referrer was paid now or held for review. */
  referrerStatus: "granted" | "held" | null;
}

/** Locks credit accounts in a fixed (id) order, so two users redeeming each other's codes can't deadlock. */
async function lockAccounts(tx: Tx, userIds: string[]) {
  const ids = [...new Set(userIds)].sort();
  await tx
    .select({ id: creditAccounts.id })
    .from(creditAccounts)
    .where(inArray(creditAccounts.userId, ids))
    .orderBy(asc(creditAccounts.userId))
    .for("update");
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as {
    code?: string;
    constraint_name?: string;
    cause?: { code?: string; constraint_name?: string };
  };
  const pg = e?.cause ?? e;
  return pg?.code === "23505" && pg?.constraint_name === constraint;
}

export async function redeemCode(
  db: Database,
  input: RedeemCodeInput,
  now: Date = new Date(),
): Promise<RedeemCodeResult> {
  const code = normalizeCode(input.code);
  if (!code || code.length > 64) throw new CodeRedemptionError("not_found");

  // Rate limit first, and record the attempt in its own commit so a
  // failed guess still counts.
  const [{ recent } = { recent: 0 }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(codeAttempts)
    .where(
      and(
        eq(codeAttempts.userId, input.userId),
        gte(codeAttempts.createdAt, new Date(now.getTime() - ONE_HOUR_MS)),
      ),
    );
  if (recent >= CODE_ATTEMPTS_PER_HOUR) throw new CodeRedemptionError("rate_limited");
  const [attempt] = await db
    .insert(codeAttempts)
    .values({ userId: input.userId, code, createdAt: now })
    .returning({ id: codeAttempts.id });

  const ipHash = hashIdentifier(input.ip);
  const deviceHash = hashIdentifier(input.deviceId);

  try {
    const result = await db.transaction(async (tx) => {
      const [coupon] = await tx
        .select()
        .from(coupons)
        .where(sql`lower(${coupons.code}) = lower(${code})`)
        .for("update");
      const [referral] = coupon
        ? []
        : await tx
            .select()
            .from(referralCodes)
            .where(sql`lower(${referralCodes.code}) = lower(${code})`);
      if (!coupon && !referral) throw new CodeRedemptionError("not_found");

      const referrerId = referral?.userId ?? null;
      if (referrerId === input.userId) throw new CodeRedemptionError("own_code");
      await lockAccounts(tx, referrerId ? [input.userId, referrerId] : [input.userId]);

      const [existing] = await tx
        .select({ id: codeRedemptions.id })
        .from(codeRedemptions)
        .where(eq(codeRedemptions.userId, input.userId));
      if (existing) throw new CodeRedemptionError("already_redeemed");

      if (coupon) {
        if (!coupon.active) throw new CodeRedemptionError("inactive");
        if (coupon.expiresAt && coupon.expiresAt <= now) throw new CodeRedemptionError("expired");
        if (coupon.maxRedemptions !== null) {
          // The coupon row is locked FOR UPDATE above, so this count can't race.
          const [{ used } = { used: 0 }] = await tx
            .select({ used: sql<number>`count(*)::int` })
            .from(codeRedemptions)
            .where(eq(codeRedemptions.couponId, coupon.id));
          if (used >= coupon.maxRedemptions) throw new CodeRedemptionError("exhausted");
        }

        const [redemption] = await tx
          .insert(codeRedemptions)
          .values({
            userId: input.userId,
            codeType: "coupon",
            couponId: coupon.id,
            creditsToUser: coupon.credits,
            creditsToReferrer: 0,
            ipHash,
            deviceHash,
          })
          .returning();
        if (!redemption) throw new Error("code_redemptions insert returned no row");

        const entry = await postLedgerEntry(tx, {
          userId: input.userId,
          type: "coupon_credit",
          credits: coupon.credits,
          sourceType: REFEREE_SOURCE,
          sourceId: redemption.id,
          note: `Coupon ${coupon.code}`,
        });
        return {
          redemptionId: redemption.id,
          codeType: "coupon" as const,
          creditsToUser: coupon.credits,
          balanceAfter: entry.balanceAfter,
          referrerStatus: null,
        };
      }

      // Referral. Flag when this code was already redeemed from the same IP or device.
      const sameSource = [
        ipHash ? eq(codeRedemptions.ipHash, ipHash) : undefined,
        deviceHash ? eq(codeRedemptions.deviceHash, deviceHash) : undefined,
      ].filter((c) => c !== undefined);
      const [{ repeats } = { repeats: 0 }] =
        sameSource.length > 0
          ? await tx
              .select({ repeats: sql<number>`count(*)::int` })
              .from(codeRedemptions)
              .where(and(eq(codeRedemptions.referralCodeId, referral!.id), or(...sameSource)))
          : [{ repeats: 0 }];
      const flagged = repeats >= REFERRAL_FLAG_REPEATS;

      const [redemption] = await tx
        .insert(codeRedemptions)
        .values({
          userId: input.userId,
          codeType: "referral",
          referralCodeId: referral!.id,
          creditsToUser: REFERRAL_REWARD_CREDITS,
          creditsToReferrer: REFERRAL_REWARD_CREDITS,
          referrerStatus: flagged ? "held" : "granted",
          flaggedForAbuse: flagged,
          flagReason: flagged
            ? `${repeats} earlier redemption(s) of this code from the same IP or device`
            : null,
          ipHash,
          deviceHash,
        })
        .returning();
      if (!redemption) throw new Error("code_redemptions insert returned no row");

      const entry = await postLedgerEntry(tx, {
        userId: input.userId,
        type: "referral_credit",
        credits: REFERRAL_REWARD_CREDITS,
        sourceType: REFEREE_SOURCE,
        sourceId: redemption.id,
        note: `Referral code ${referral!.code}`,
      });
      if (!flagged) {
        await postLedgerEntry(tx, {
          userId: referrerId!,
          type: "referral_credit",
          credits: REFERRAL_REWARD_CREDITS,
          sourceType: REFERRER_SOURCE,
          sourceId: redemption.id,
          note: "Referral reward",
        });
      }
      return {
        redemptionId: redemption.id,
        codeType: "referral" as const,
        creditsToUser: REFERRAL_REWARD_CREDITS,
        balanceAfter: entry.balanceAfter,
        referrerStatus: flagged ? ("held" as const) : ("granted" as const),
      };
    });

    if (attempt) {
      await db.update(codeAttempts).set({ succeeded: true }).where(eq(codeAttempts.id, attempt.id));
    }
    return result;
  } catch (err) {
    // Two concurrent redemptions by one user: the unique index decides.
    if (isUniqueViolation(err, "code_redemptions_user_id_key")) {
      throw new CodeRedemptionError("already_redeemed");
    }
    throw err;
  }
}

export class ReferralReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferralReviewError";
  }
}

/**
 * Admin decision on a flagged referral (16.2.20). Approve grants the
 * referrer's held credits; reject keeps them withheld. The referee's
 * credits are never touched. Audited with the reason. Idempotent: a
 * second decision on an already-decided referral is refused.
 */
export async function reviewFlaggedReferral(
  db: Database,
  input: {
    adminUserId: string;
    redemptionId: string;
    decision: "approve" | "reject";
    reason: string;
  },
  now: Date = new Date(),
): Promise<{ referrerStatus: "granted" | "rejected"; balanceAfter: number | null }> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ReferralReviewError("A review needs a reason");

  return db.transaction(async (tx) => {
    const [redemption] = await tx
      .select({
        id: codeRedemptions.id,
        codeType: codeRedemptions.codeType,
        referrerStatus: codeRedemptions.referrerStatus,
        creditsToReferrer: codeRedemptions.creditsToReferrer,
        referrerId: referralCodes.userId,
      })
      .from(codeRedemptions)
      .leftJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
      .where(eq(codeRedemptions.id, input.redemptionId))
      .for("update", { of: codeRedemptions });
    if (!redemption || redemption.codeType !== "referral" || !redemption.referrerId) {
      throw new ReferralReviewError("Referral redemption not found");
    }
    if (redemption.referrerStatus !== "held") {
      throw new ReferralReviewError(`Referral already ${redemption.referrerStatus}`);
    }

    const status = input.decision === "approve" ? "granted" : "rejected";
    let balanceAfter: number | null = null;
    if (status === "granted") {
      balanceAfter = (
        await postLedgerEntry(tx, {
          userId: redemption.referrerId,
          type: "referral_credit",
          credits: redemption.creditsToReferrer,
          sourceType: REFERRER_SOURCE,
          sourceId: redemption.id,
          note: "Referral reward (approved after review)",
        })
      ).balanceAfter;
    }

    await tx
      .update(codeRedemptions)
      .set({ referrerStatus: status, reviewedByUserId: input.adminUserId, reviewedAt: now })
      .where(eq(codeRedemptions.id, redemption.id));
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: `referral.${input.decision}`,
      targetType: "code_redemption",
      targetId: redemption.id,
      reason,
      metadata: { referrerId: redemption.referrerId, credits: redemption.creditsToReferrer },
    });
    return { referrerStatus: status, balanceAfter };
  });
}

/** Admin review queue: referrals whose referrer credits are held. */
export async function listFlaggedReferrals(db: Database) {
  const referee = sql<string>`referee.email`;
  return db
    .select({
      redemptionId: codeRedemptions.id,
      refereeId: codeRedemptions.userId,
      refereeEmail: referee,
      referrerId: referralCodes.userId,
      code: referralCodes.code,
      flagReason: codeRedemptions.flagReason,
      createdAt: codeRedemptions.createdAt,
    })
    .from(codeRedemptions)
    .innerJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
    .innerJoin(sql`${users} as referee`, sql`referee.id = ${codeRedemptions.userId}`)
    .where(eq(codeRedemptions.referrerStatus, "held"))
    .orderBy(desc(codeRedemptions.createdAt));
}

// --- Admin coupon management (prd.md §2.2) ---------------------------

export interface CouponInput {
  code: string;
  credits: number;
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  active?: boolean;
}

export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

/** Referral codes look like RP-XXXXXX; coupons can't, or one would shadow the other. */
const REFERRAL_PREFIX = "RP-";

export async function createCoupon(db: Database, adminUserId: string, input: CouponInput) {
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) {
    throw new CouponError("Code must be 3–32 letters, digits, - or _");
  }
  if (code.startsWith(REFERRAL_PREFIX))
    throw new CouponError(`Coupon codes can't start with ${REFERRAL_PREFIX}`);

  return db.transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: referralCodes.id })
      .from(referralCodes)
      .where(sql`lower(${referralCodes.code}) = lower(${code})`);
    if (clash) throw new CouponError("That code is already a referral code");

    try {
      const [coupon] = await tx
        .insert(coupons)
        .values({
          code,
          credits: input.credits,
          maxRedemptions: input.maxRedemptions ?? null,
          expiresAt: input.expiresAt ?? null,
          active: input.active ?? true,
        })
        .returning();
      if (!coupon) throw new Error("coupons insert returned no row");
      await tx.insert(auditLogs).values({
        adminUserId,
        action: "coupon.create",
        targetType: "coupon",
        targetId: coupon.id,
        reason: `Created coupon ${code}`,
        metadata: { credits: input.credits, maxRedemptions: input.maxRedemptions ?? null },
      });
      return coupon;
    } catch (err) {
      if (isUniqueViolation(err, "coupons_lower_code_key"))
        throw new CouponError("That coupon code already exists");
      throw err;
    }
  });
}

/** Change limits or deactivate. Credits and code are fixed once created (redemptions reference them). */
export async function updateCoupon(
  db: Database,
  adminUserId: string,
  couponId: string,
  input: {
    maxRedemptions?: number | null;
    expiresAt?: Date | null;
    active?: boolean;
    reason: string;
  },
) {
  return db.transaction(async (tx) => {
    const [coupon] = await tx
      .update(coupons)
      .set({
        ...(input.maxRedemptions !== undefined && { maxRedemptions: input.maxRedemptions }),
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        ...(input.active !== undefined && { active: input.active }),
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, couponId))
      .returning();
    if (!coupon) throw new CouponError("Coupon not found");
    await tx.insert(auditLogs).values({
      adminUserId,
      action: "coupon.update",
      targetType: "coupon",
      targetId: coupon.id,
      reason: input.reason,
      metadata: {
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt?.toISOString() ?? input.expiresAt,
        active: input.active,
      },
    });
    return coupon;
  });
}

/** All coupons with how many times each was redeemed. */
export async function listCoupons(db: Database) {
  return db
    .select({
      id: coupons.id,
      code: coupons.code,
      credits: coupons.credits,
      maxRedemptions: coupons.maxRedemptions,
      expiresAt: coupons.expiresAt,
      active: coupons.active,
      createdAt: coupons.createdAt,
      redemptions: sql<number>`(select count(*)::int from ${codeRedemptions} where ${codeRedemptions.couponId} = ${coupons.id})`,
    })
    .from(coupons)
    .orderBy(desc(coupons.createdAt));
}

/** For callers that only need to know if a user can still apply a code (e.g. hiding the input). */
export async function hasRedeemedCode(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: codeRedemptions.id })
    .from(codeRedemptions)
    .where(eq(codeRedemptions.userId, userId));
  return Boolean(row);
}
