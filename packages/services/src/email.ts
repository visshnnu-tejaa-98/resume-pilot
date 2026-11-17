import { REFERRAL_REWARD_CREDITS } from "@resume-pilot/credits";
import {
  coupons,
  creditLedger,
  emailMessages,
  emailTemplateSettings,
  payments,
  emailSuppressions,
  users,
  type Database,
} from "@resume-pilot/database";
import { buildEmailLinks, PaymentSuccessEmail, paymentSuccessEmailSubject, WelcomeEmail, welcomeEmailSubject, type SendEmailInput } from "@resume-pilot/emails";
import { emailIdempotencyKey, type TransactionalEmailJob } from "@resume-pilot/queue";
import { processCodeAppliedEmail, processRechargeFailedEmail, processRechargePendingEmail, processReferralRewardEmail } from "./email-transactional";
import { getEmailPreferences, type MarketingCategory } from "./email-prefs";
import { REFUND_WINDOW_MONTHS } from "./payments";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

/**
 * Transactional email processing — prd.md §13.1, §13.2. Runs in the
 * worker; `send` is injected so tests never touch SMTP.
 *
 * Exactly-once (acceptance 16.2.16): one `email_messages` row per
 * idempotency key (unique index), and the send runs under a
 * transaction-scoped advisory lock on that key, so a duplicate job
 * either waits and then sees `sent`, or never starts. The only
 * remaining duplicate window is a crash after SMTP accepted the message
 * but before the row is marked sent; at-least-once is unavoidable there
 * with plain SMTP.
 */

export type SendFn = (input: SendEmailInput) => Promise<{ messageId: string }>;

export interface EmailProcessContext {
  send: SendFn;
  /** Public base URL for links, e.g. https://app.example.com */
  appUrl: string;
  /** Code shown as the launch gift in the welcome email (prd.md §2.1). */
  launchCouponCode: string;
  /** Footer contact details and logo (prd.md §16.4 — sender/domain are config). */
  supportEmail?: string;
  postalAddress?: string;
  /** Absolute https URL of a PNG logo; email clients block SVG. */
  logoUrl?: string;
  /** True on the job's last attempt: a transient failure then marks the row failed. */
  isFinalAttempt: boolean;
}

export type EmailProcessResult =
  | { status: "sent"; messageId: string }
  | { status: "already_sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed_permanent"; reason: string };

interface SmtpLikeError {
  responseCode?: number;
  command?: string;
  code?: string;
  message?: string;
}

/**
 * A 5xx on the recipient (RCPT TO, or Nodemailer's EENVELOPE) is a hard
 * bounce: retrying won't help, and the address gets suppressed. 4xx and
 * connection errors are transient and retry. A 5xx on AUTH/connection
 * is a config problem, not the recipient's, so it retries too (and
 * alerts via the failed status on the final attempt).
 */
export function isPermanentRecipientRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as SmtpLikeError;
  const is5xx = typeof e.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600;
  return is5xx && (e.command === "RCPT TO" || e.code === "EENVELOPE");
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 1000);
}

async function activeLaunchCoupon(
  db: Database,
  code: string,
): Promise<{ code: string; credits: number } | null> {
  const [row] = await db
    .select({ code: coupons.code, credits: coupons.credits })
    .from(coupons)
    .where(
      and(
        sql`lower(${coupons.code}) = lower(${code})`,
        eq(coupons.active, true),
        or(isNull(coupons.expiresAt), gt(coupons.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function processTransactionalEmail(
  db: Database,
  job: TransactionalEmailJob,
  ctx: EmailProcessContext,
): Promise<EmailProcessResult> {
  switch (job.templateKey) {
    case "welcome":
      return processWelcomeEmail(db, job, ctx);
    case "recharge_success":
      return processRechargeEmail(db, job, ctx);
    case "recharge_failed":
      return processRechargeFailedEmail(db, job, ctx);
    case "recharge_pending":
      return processRechargePendingEmail(db, job, ctx);
    case "code_applied":
      return processCodeAppliedEmail(db, job, ctx);
    case "referral_reward":
      return processReferralRewardEmail(db, job, ctx);
  }
}

export interface Rendered {
  subject: string;
  element: SendEmailInput["element"];
  headers?: Record<string, string>;
  /** Stored on the email_messages row once sent (admin email log). */
  mergeData: Record<string, unknown>;
}

/**
 * Exactly-once delivery for one idempotency key: queued row, advisory
 * lock, terminal-state checks, suppression, send, then mark sent /
 * failed. `render` runs inside the lock, right before sending.
 */
export async function deliverOnce(
  db: Database,
  ctx: EmailProcessContext,
  opts: {
    idempotencyKey: string;
    templateKey: string;
    user: { id: string; email: string; status: string };
    /** Money emails go to suspended users too (prd.md §13.1). */
    skipSuspended: boolean;
    queuedMergeData: Record<string, unknown>;
    /**
     * Marketing: consent for this category, every suppression reason and
     * the template's on/off switch are checked inside the lock, at send
     * time, so an unsubscribe mid-campaign stops every later send.
     */
    marketing?: { category: MarketingCategory; campaignId?: string };
    render: () => Promise<Rendered>;
  },
): Promise<EmailProcessResult> {
  const { idempotencyKey, user } = opts;
  // Logged as queued outside the send transaction, so the row survives
  // a transient failure's rollback and the admin log shows it retrying.
  await db
    .insert(emailMessages)
    .values({ userId: user.id, templateKey: opts.templateKey, campaignId: opts.marketing?.campaignId ?? null, status: "queued", idempotencyKey, mergeData: opts.queuedMergeData })
    .onConflictDoNothing({ target: emailMessages.idempotencyKey });

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);

    const [message] = await tx.select().from(emailMessages).where(eq(emailMessages.idempotencyKey, idempotencyKey)).limit(1);
    if (!message) throw new Error(`email_messages row missing for ${idempotencyKey}`);

    // Terminal states: never send again.
    if (message.status === "sent") return { status: "already_sent" } as const;
    if (message.status === "skipped") return { status: "skipped", reason: message.error ?? "skipped" } as const;

    const markSkipped = async (reason: string) => {
      await tx.update(emailMessages).set({ status: "skipped", error: reason, updatedAt: new Date() }).where(eq(emailMessages.id, message.id));
      return { status: "skipped", reason } as const;
    };

    if (opts.skipSuspended && user.status === "suspended") return markSkipped("user suspended");

    const [suppressed] = await tx
      .select({ reason: emailSuppressions.reason })
      .from(emailSuppressions)
      .where(sql`lower(${emailSuppressions.email}) = lower(${user.email})`)
      .limit(1);
    // Hard bounces block every email. Complaints / unsubscribe-all only block marketing.
    if (suppressed?.reason === "hard_bounce") return markSkipped("address suppressed (hard bounce)");
    if (opts.marketing) {
      if (suppressed) return markSkipped(`address suppressed (${suppressed.reason.replace("_", " ")})`);
      const prefs = await getEmailPreferences(tx, user.id);
      if (!prefs[opts.marketing.category]) return markSkipped(`no consent for ${opts.marketing.category === "reminders" ? "reminders" : "product updates"}`);
      const [setting] = await tx.select({ enabled: emailTemplateSettings.enabled }).from(emailTemplateSettings).where(eq(emailTemplateSettings.templateKey, opts.templateKey));
      if (setting && !setting.enabled) return markSkipped("template switched off by admin");
    }

    const rendered = await opts.render();
    try {
      const { messageId } = await ctx.send({ to: user.email, subject: rendered.subject, element: rendered.element, headers: rendered.headers });
      await tx
        .update(emailMessages)
        .set({ status: "sent", providerMessageId: messageId, error: null, mergeData: rendered.mergeData, updatedAt: new Date() })
        .where(eq(emailMessages.id, message.id));
      return { status: "sent", messageId } as const;
    } catch (err) {
      if (isPermanentRecipientRejection(err)) {
        await tx.update(emailMessages).set({ status: "failed", error: errorText(err), updatedAt: new Date() }).where(eq(emailMessages.id, message.id));
        await tx.insert(emailSuppressions).values({ email: user.email, reason: "hard_bounce" }).onConflictDoNothing();
        return { status: "failed_permanent", reason: errorText(err) } as const;
      }
      if (ctx.isFinalAttempt) {
        await tx.update(emailMessages).set({ status: "failed", error: errorText(err), updatedAt: new Date() }).where(eq(emailMessages.id, message.id));
        // Commit the failed status, then let the job fail.
        return { status: "failed_permanent", reason: errorText(err) } as const;
      }
      // Transient: the row stays queued; let BullMQ retry.
      throw err;
    }
  });
}

export async function findUser(db: Database, userId: string) {
  const [user] = await db.select({ id: users.id, email: users.email, status: users.status, firstName: users.firstName }).from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export const links = (ctx: EmailProcessContext) => buildEmailLinks(ctx.appUrl, { supportEmail: ctx.supportEmail, address: ctx.postalAddress, logoUrl: ctx.logoUrl });

async function processWelcomeEmail(
  db: Database,
  job: Extract<TransactionalEmailJob, { templateKey: "welcome" }>,
  ctx: EmailProcessContext,
): Promise<EmailProcessResult> {
  const firstName = job.firstName?.trim() || "there";
  const user = await findUser(db, job.userId);
  // Deleted between signup and send: nothing to send, nothing to retry.
  if (!user) return { status: "skipped", reason: "user not found" };

  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    // Welcome isn't about money, so suspended users don't get it (prd.md §13.1).
    skipSuspended: true,
    queuedMergeData: { first_name: firstName },
    render: async () => {
      const launchCoupon = await activeLaunchCoupon(db, ctx.launchCouponCode);
      const l = links(ctx);
      return {
        subject: welcomeEmailSubject(firstName),
        element: WelcomeEmail({ firstName, launchCoupon, referralCredits: REFERRAL_REWARD_CREDITS, uploadUrl: l.uploadUrl, walletUrl: l.walletUrl, links: l }),
        mergeData: { first_name: firstName, launch_coupon: launchCoupon?.code ?? null, launch_coupon_credits: launchCoupon?.credits ?? null },
      };
    },
  });
}

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI", paylater: "Pay later" };
export const fmtIst = (d: Date) =>
  `${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d)} IST`;

/** Receipt for a captured payment (prd.md §11.3, §13.1). Balance is the ledger row's, not today's. */
async function processRechargeEmail(
  db: Database,
  job: Extract<TransactionalEmailJob, { templateKey: "recharge_success" }>,
  ctx: EmailProcessContext,
): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  if (!user) return { status: "skipped", reason: "user not found" };
  const [p] = await db
    .select({ paymentId: payments.paymentId, amountPaise: payments.amountPaise, credits: payments.credits, method: payments.method, capturedAt: payments.capturedAt, balanceAfter: creditLedger.balanceAfter })
    .from(payments)
    .innerJoin(creditLedger, and(eq(creditLedger.sourceType, "payment"), eq(creditLedger.sourceId, payments.id)))
    .where(and(eq(payments.id, job.paymentId), eq(payments.userId, job.userId)))
    .limit(1);
  // No purchase ledger row = no grant = no receipt.
  if (!p?.paymentId) return { status: "skipped", reason: "payment not granted" };

  const merge = {
    amount_paise: p.amountPaise,
    credits: p.credits,
    new_balance: p.balanceAfter,
    method: METHOD_LABEL[p.method ?? ""] ?? p.method ?? "Online",
    payment_id: p.paymentId,
    paid_at: fmtIst(p.capturedAt ?? new Date()),
  };
  return deliverOnce(db, ctx, {
    idempotencyKey: emailIdempotencyKey(job),
    templateKey: job.templateKey,
    user,
    skipSuspended: false,
    queuedMergeData: merge,
    render: async () => {
      const props = {
        firstName: user.firstName || "there",
        amountPaise: merge.amount_paise,
        credits: merge.credits,
        newBalance: merge.new_balance,
        method: merge.method,
        paymentId: merge.payment_id,
        paidAt: merge.paid_at,
        // No GST for now (prd.md §11.3); final-amount pricing.
        taxNote: `Prices are final; no GST is charged. Unused purchased credits can be refunded within ${REFUND_WINDOW_MONTHS} months of purchase.`,
        links: links(ctx),
      };
      return { subject: paymentSuccessEmailSubject(props), element: PaymentSuccessEmail(props), mergeData: merge };
    },
  });
}
