import { REFERRAL_REWARD_CREDITS } from "@resume-pilot/credits";
import {
  coupons,
  emailMessages,
  emailSuppressions,
  users,
  type Database,
} from "@resume-pilot/database";
import { buildEmailLinks, WelcomeEmail, welcomeEmailSubject, type SendEmailInput } from "@resume-pilot/emails";
import { emailIdempotencyKey, type TransactionalEmailJob } from "@resume-pilot/queue";
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
  }
}

async function processWelcomeEmail(
  db: Database,
  job: Extract<TransactionalEmailJob, { templateKey: "welcome" }>,
  ctx: EmailProcessContext,
): Promise<EmailProcessResult> {
  const idempotencyKey = emailIdempotencyKey(job);
  const firstName = job.firstName?.trim() || "there";

  const [user] = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.id, job.userId))
    .limit(1);
  if (!user) {
    // Deleted between signup and send: nothing to send, nothing to retry.
    return { status: "skipped", reason: "user not found" };
  }

  // Logged as queued outside the send transaction, so the row survives
  // a transient failure's rollback and the admin log shows it retrying.
  await db
    .insert(emailMessages)
    .values({
      userId: user.id,
      templateKey: job.templateKey,
      status: "queued",
      idempotencyKey,
      mergeData: { first_name: firstName },
    })
    .onConflictDoNothing({ target: emailMessages.idempotencyKey });

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey}))`);

    const [message] = await tx
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!message) throw new Error(`email_messages row missing for ${idempotencyKey}`);

    // Terminal states: never send again.
    if (message.status === "sent") return { status: "already_sent" } as const;
    if (message.status === "skipped") {
      return { status: "skipped", reason: message.error ?? "skipped" } as const;
    }

    const markSkipped = async (reason: string) => {
      await tx
        .update(emailMessages)
        .set({ status: "skipped", error: reason, updatedAt: new Date() })
        .where(eq(emailMessages.id, message.id));
      return { status: "skipped", reason } as const;
    };

    // Welcome isn't about money, so suspended users don't get it (prd.md §13.1).
    if (user.status === "suspended") return markSkipped("user suspended");

    const [suppressed] = await tx
      .select({ reason: emailSuppressions.reason })
      .from(emailSuppressions)
      .where(sql`lower(${emailSuppressions.email}) = lower(${user.email})`)
      .limit(1);
    // Hard bounces block every email. Complaints / unsubscribe-all only block marketing.
    if (suppressed?.reason === "hard_bounce")
      return markSkipped("address suppressed (hard bounce)");

    const launchCoupon = await activeLaunchCoupon(db, ctx.launchCouponCode);
    const links = buildEmailLinks(ctx.appUrl, { supportEmail: ctx.supportEmail, address: ctx.postalAddress, logoUrl: ctx.logoUrl });

    try {
      const { messageId } = await ctx.send({
        to: user.email,
        subject: welcomeEmailSubject(firstName),
        element: WelcomeEmail({
          firstName,
          launchCoupon,
          referralCredits: REFERRAL_REWARD_CREDITS,
          uploadUrl: links.uploadUrl,
          walletUrl: links.walletUrl,
          links,
        }),
      });

      await tx
        .update(emailMessages)
        .set({
          status: "sent",
          providerMessageId: messageId,
          error: null,
          mergeData: {
            first_name: firstName,
            launch_coupon: launchCoupon?.code ?? null,
            launch_coupon_credits: launchCoupon?.credits ?? null,
          },
          updatedAt: new Date(),
        })
        .where(eq(emailMessages.id, message.id));
      return { status: "sent", messageId } as const;
    } catch (err) {
      if (isPermanentRecipientRejection(err)) {
        await tx
          .update(emailMessages)
          .set({ status: "failed", error: errorText(err), updatedAt: new Date() })
          .where(eq(emailMessages.id, message.id));
        await tx
          .insert(emailSuppressions)
          .values({ email: user.email, reason: "hard_bounce" })
          .onConflictDoNothing();
        return { status: "failed_permanent", reason: errorText(err) } as const;
      }

      if (ctx.isFinalAttempt) {
        await tx
          .update(emailMessages)
          .set({ status: "failed", error: errorText(err), updatedAt: new Date() })
          .where(eq(emailMessages.id, message.id));
        // Commit the failed status, then let the job fail.
        return { status: "failed_permanent", reason: errorText(err) } as const;
      }
      // Transient: the row stays queued; let BullMQ retry.
      throw err;
    }
  });
}
