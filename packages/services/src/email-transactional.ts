import { codeRedemptions, coupons, creditLedger, emailMessages, payments, referralCodes, type Database } from "@resume-pilot/database";
import { CodeAppliedEmail, codeAppliedEmailSubject, PaymentFailedEmail, paymentFailedEmailSubject, PaymentPendingEmail, paymentPendingEmailSubject, ReferralRewardEmail, referralRewardEmailSubject } from "@resume-pilot/emails";
import { emailIdempotencyKey, type TransactionalEmailJob } from "@resume-pilot/queue";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { deliverOnce, findUser, fmtIst, links, type EmailProcessContext, type EmailProcessResult } from "./email";

/**
 * The money/code transactional emails — prd.md §13.1. Each reads its
 * facts from the row that triggered it (ledger entry, redemption,
 * payment), so a retry or a late job sends the same numbers, and each
 * re-checks that the trigger still holds (a pending payment that has
 * since been captured gets no "pending" email).
 */

type Job<K extends TransactionalEmailJob["templateKey"]> = Extract<TransactionalEmailJob, { templateKey: K }>;

const METHOD: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI", paylater: "Pay later" };
const method = (m: string | null) => METHOD[m ?? ""] ?? m ?? "Online";
const skip = (reason: string): EmailProcessResult => ({ status: "skipped", reason });

export async function processCodeAppliedEmail(db: Database, job: Job<"code_applied">, ctx: EmailProcessContext): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  if (!user) return skip("user not found");
  const [r] = await db
    .select({
      coupon: coupons.code,
      referral: referralCodes.code,
      credits: creditLedger.credits,
      balanceAfter: creditLedger.balanceAfter,
      at: creditLedger.createdAt,
    })
    .from(codeRedemptions)
    .innerJoin(creditLedger, and(eq(creditLedger.sourceType, "code_redemption"), eq(creditLedger.sourceId, codeRedemptions.id)))
    .leftJoin(coupons, eq(coupons.id, codeRedemptions.couponId))
    .leftJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
    .where(and(eq(codeRedemptions.id, job.redemptionId), eq(codeRedemptions.userId, job.userId)));
  if (!r) return skip("redemption not credited");
  const merge = { code: r.coupon ?? r.referral ?? "", credits: r.credits, balance: r.balanceAfter, applied_at: fmtIst(r.at) };
  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    skipSuspended: true,
    queuedMergeData: merge,
    render: async () => {
      const props = { firstName: user.firstName || "there", code: merge.code, credits: merge.credits, newBalance: merge.balance, appliedAt: merge.applied_at, links: links(ctx) };
      return { subject: codeAppliedEmailSubject(props), element: CodeAppliedEmail(props), mergeData: merge };
    },
  });
}

/** Sent to the referrer once their reward is in the ledger (immediately, or after an abuse review approves it). */
export async function processReferralRewardEmail(db: Database, job: Job<"referral_reward">, ctx: EmailProcessContext): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  if (!user) return skip("user not found");
  const [r] = await db
    .select({ credits: creditLedger.credits, balanceAfter: creditLedger.balanceAfter, at: creditLedger.createdAt, code: referralCodes.code })
    .from(creditLedger)
    .innerJoin(codeRedemptions, eq(codeRedemptions.id, creditLedger.sourceId))
    .innerJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
    .where(and(eq(creditLedger.sourceType, "code_redemption_referrer"), eq(creditLedger.sourceId, job.redemptionId), eq(creditLedger.userId, job.userId)));
  if (!r) return skip("referral reward not granted");
  const l = links(ctx);
  const merge = { referral_code: r.code, credits: r.credits, balance: r.balanceAfter, granted_at: fmtIst(r.at) };
  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    skipSuspended: true,
    queuedMergeData: merge,
    render: async () => {
      const props = { firstName: user.firstName || "there", credits: r.credits, newBalance: r.balanceAfter, referralCode: r.code, shareUrl: `${l.appUrl}/sign-up?code=${encodeURIComponent(r.code)}`, grantedAt: merge.granted_at, links: l };
      return { subject: referralRewardEmailSubject(props), element: ReferralRewardEmail(props), mergeData: merge };
    },
  });
}

async function paymentFor(db: Database, job: { userId: string; paymentId: string }) {
  const [p] = await db.select().from(payments).where(and(eq(payments.id, job.paymentId), eq(payments.userId, job.userId)));
  return p ?? null;
}

/** `payment.failed`. Money emails reach suspended users too (§13.1). Skipped if a retry on the order already succeeded. */
export async function processRechargeFailedEmail(db: Database, job: Job<"recharge_failed">, ctx: EmailProcessContext): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  const p = await paymentFor(db, job);
  if (!user || !p) return skip("payment not found");
  if (p.status !== "failed") return skip(`payment is ${p.status}, not failed`);
  const merge = { amount_paise: p.amountPaise, payment_id: p.orderId, method: method(p.method), reason: p.failureReason };
  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    skipSuspended: false,
    queuedMergeData: merge,
    render: async () => {
      const props = { amountPaise: p.amountPaise, method: merge.method, reason: p.failureReason, paymentId: p.orderId, bankRefundWindow: process.env.BANK_REFUND_WINDOW || "5–7 working days", links: links(ctx) };
      return { subject: paymentFailedEmailSubject(props), element: PaymentFailedEmail(props), mergeData: merge };
    },
  });
}

/** 10 minutes after the order: only if it's still neither captured nor failed. */
export async function processRechargePendingEmail(db: Database, job: Job<"recharge_pending">, ctx: EmailProcessContext): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  const p = await paymentFor(db, job);
  if (!user || !p) return skip("payment not found");
  if (p.status !== "created") return skip(`payment already ${p.status}`);
  const l = links(ctx);
  const merge = { amount_paise: p.amountPaise, credits: p.credits, payment_id: p.orderId };
  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    skipSuspended: false,
    queuedMergeData: merge,
    render: async () => {
      const props = { amountPaise: p.amountPaise, credits: p.credits, method: method(p.method), paymentId: p.orderId, statusUrl: `${l.walletUrl}/payments/${encodeURIComponent(p.orderId)}`, timeLimit: process.env.PAYMENT_PENDING_LIMIT || "24 hours", links: l };
      return { subject: paymentPendingEmailSubject(props), element: PaymentPendingEmail(props), mergeData: merge };
    },
  });
}

/**
 * Outbox backstop (runs every minute). Each email is also queued right
 * where its trigger happens; this catches any enqueue that was lost (Redis
 * blip after the DB commit), so "fires from the ledger row" holds even
 * then. Looks back 2 days; the job id + email_messages key make
 * re-queueing anything already sent a no-op.
 */
export async function findMissingTransactionalEmails(db: Database, now = new Date()): Promise<TransactionalEmailJob[]> {
  const since = new Date(now.getTime() - 2 * 86_400_000);
  const noMessage = (key: ReturnType<typeof sql>) => sql`not exists (select 1 from ${emailMessages} where ${emailMessages.idempotencyKey} = ${key})`;

  const ledger = await db
    .select({ userId: creditLedger.userId, sourceType: creditLedger.sourceType, sourceId: creditLedger.sourceId })
    .from(creditLedger)
    .where(
      and(
        gt(creditLedger.createdAt, since),
        inArray(creditLedger.sourceType, ["payment", "code_redemption", "code_redemption_referrer"]),
        noMessage(
          sql`(case ${creditLedger.sourceType} when 'payment' then 'recharge_success:' when 'code_redemption' then 'code_applied:' else 'referral_reward:' end) || ${creditLedger.sourceId}::text`,
        ),
      ),
    )
    .limit(500);
  const failed = await db
    .select({ userId: payments.userId, id: payments.id })
    .from(payments)
    .where(and(eq(payments.status, "failed"), gt(payments.updatedAt, since), noMessage(sql`'recharge_failed:' || ${payments.id}::text`)))
    .limit(500);
  // Pending: created more than 10 minutes ago, still `created`.
  const pending = await db
    .select({ userId: payments.userId, id: payments.id })
    .from(payments)
    .where(and(eq(payments.status, "created"), isNull(payments.paymentId), lt(payments.createdAt, new Date(now.getTime() - 10 * 60_000)), gt(payments.createdAt, since), noMessage(sql`'recharge_pending:' || ${payments.id}::text`)))
    .limit(500);

  return [
    ...ledger.map((r): TransactionalEmailJob =>
      r.sourceType === "payment"
        ? { templateKey: "recharge_success", userId: r.userId, paymentId: r.sourceId }
        : r.sourceType === "code_redemption"
          ? { templateKey: "code_applied", userId: r.userId, redemptionId: r.sourceId }
          : { templateKey: "referral_reward", userId: r.userId, redemptionId: r.sourceId },
    ),
    ...failed.map((r): TransactionalEmailJob => ({ templateKey: "recharge_failed", userId: r.userId, paymentId: r.id })),
    ...pending.map((r): TransactionalEmailJob => ({ templateKey: "recharge_pending", userId: r.userId, paymentId: r.id })),
  ];
}
