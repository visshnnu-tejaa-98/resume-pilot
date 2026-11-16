import { codeRedemptions, coupons, creditPackages, payments, referralCodes, users, type Database } from "@resume-pilot/database";
import { and, asc, desc, eq } from "drizzle-orm";

/** Top-up packs shown in the wallet (prd.md §3.2). Amounts live in the DB, never in code. */
export async function listActiveCreditPackages(db: Database) {
  return db
    .select({
      id: creditPackages.id,
      pricePaise: creditPackages.pricePaise,
      credits: creditPackages.credits,
      bonusCredits: creditPackages.bonusCredits,
    })
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(asc(creditPackages.sortOrder), asc(creditPackages.pricePaise));
}

export interface MyRedemption {
  codeType: "coupon" | "referral";
  code: string | null;
  creditsToUser: number;
  createdAt: Date;
}

/** The one code this user has redeemed, if any (one per account, ever — §2.1). */
export async function getMyRedemption(db: Database, userId: string): Promise<MyRedemption | null> {
  const [row] = await db
    .select({
      codeType: codeRedemptions.codeType,
      couponCode: coupons.code,
      referralCode: referralCodes.code,
      creditsToUser: codeRedemptions.creditsToUser,
      createdAt: codeRedemptions.createdAt,
    })
    .from(codeRedemptions)
    .leftJoin(coupons, eq(coupons.id, codeRedemptions.couponId))
    .leftJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
    .where(eq(codeRedemptions.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    codeType: row.codeType,
    code: row.couponCode ?? row.referralCode ?? null,
    creditsToUser: row.creditsToUser,
    createdAt: row.createdAt,
  };
}

export interface MyReferral {
  id: string;
  /** Masked ("k•••@gmail.com") — the referrer never sees a friend's full email. */
  friend: string;
  joinedAt: Date;
  creditsToFriend: number;
  creditsToReferrer: number;
  referrerStatus: "granted" | "held" | "rejected";
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** Friends who redeemed this user's referral code, newest first. */
export async function listMyReferrals(db: Database, userId: string): Promise<MyReferral[]> {
  const rows = await db
    .select({
      id: codeRedemptions.id,
      email: users.email,
      joinedAt: codeRedemptions.createdAt,
      creditsToFriend: codeRedemptions.creditsToUser,
      creditsToReferrer: codeRedemptions.creditsToReferrer,
      referrerStatus: codeRedemptions.referrerStatus,
    })
    .from(codeRedemptions)
    .innerJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
    .innerJoin(users, eq(users.id, codeRedemptions.userId))
    .where(eq(referralCodes.userId, userId))
    .orderBy(desc(codeRedemptions.createdAt));
  return rows.map(({ email, ...r }) => ({ ...r, friend: maskEmail(email) }));
}

/** One of the caller's own payments, by Razorpay order id (payment result page). Null if not theirs. */
export async function getMyPayment(db: Database, input: { userId: string; orderId: string }) {
  const [row] = await db
    .select({
      orderId: payments.orderId,
      paymentId: payments.paymentId,
      amountPaise: payments.amountPaise,
      credits: payments.credits,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(eq(payments.orderId, input.orderId), eq(payments.userId, input.userId)));
  return row ?? null;
}
