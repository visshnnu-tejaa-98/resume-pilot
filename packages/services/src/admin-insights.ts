import {
  aiJobs,
  auditLogs,
  creditLedger,
  emailEvents,
  emailMessages,
  emailPreferences,
  emailSuppressions,
  payments,
  refunds,
  resumes,
  resumeVersions,
  users,
  type Database,
} from "@resume-pilot/database";
import { resumeSchema, type Resume } from "@resume-pilot/validators/resume";
import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";

/**
 * Admin metrics and user detail beyond the overview basics — prd.md
 * §12.2, §14.2, acceptance 16.2.15. Callers must be admins
 * (`adminProcedure` / `requireAdmin()`).
 */

const since = (days: number) => new Date(Date.now() - days * 86_400_000);
const n = (v: unknown) => Number(v ?? 0);

/** "(12 violations: …)" in a GroundingFailedError message (packages/ai). */
const violationsInError = sql<number>`coalesce(substring(${aiJobs.error} from '\\((\\d+) violations')::int, 0)`;

export async function adminInsights(db: Database, days: number) {
  const from = since(days);
  const [byType, [grounding], [blocked], [refunded], flows, signups, email] = await Promise.all([
    // Success/failure and latency per action type.
    db
      .select({
        type: aiJobs.type,
        total: count(),
        succeeded: sql<number>`count(*) filter (where ${aiJobs.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${aiJobs.status} = 'failed')::int`,
        avgLatencyMs: sql<number>`coalesce(avg(extract(epoch from (${aiJobs.updatedAt} - ${aiJobs.createdAt})) * 1000) filter (where ${aiJobs.status} = 'succeeded'), 0)::int`,
        creditsCharged: sql<number>`coalesce(sum(${aiJobs.creditsCharged}), 0)::int`,
        costPaise: sql<number>`coalesce(sum(${aiJobs.costPaise}), 0)::int`,
      })
      .from(aiJobs)
      .where(gte(aiJobs.createdAt, from))
      .groupBy(aiJobs.type),
    // First-attempt violations the automatic retry fixed (stored on the saved version).
    db
      .select({
        generations: count(),
        withViolations: sql<number>`count(*) filter (where ${resumeVersions.generationMeta} -> 'firstAttemptViolations' <> '{}'::jsonb)::int`,
        violations: sql<number>`coalesce(sum((select sum(v::int) from jsonb_each_text(coalesce(${resumeVersions.generationMeta} -> 'firstAttemptViolations', '{}'::jsonb)) as t(k, v))), 0)::int`,
      })
      .from(resumeVersions)
      .where(and(eq(resumeVersions.kind, "generated"), gte(resumeVersions.createdAt, from), sql`${resumeVersions.generationMeta} ? 'aiJobId'`)),
    // Generations the grounding check rejected outright (nothing saved, hold released).
    db
      .select({ jobs: count(), violations: sql<number>`coalesce(sum(${violationsInError}), 0)::int` })
      .from(aiJobs)
      .where(and(eq(aiJobs.type, "generation"), eq(aiJobs.status, "failed"), gte(aiJobs.createdAt, from), sql`${aiJobs.error} like 'Grounding check failed%'`)),
    db
      .select({ paise: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int`, n: count() })
      .from(refunds)
      .where(and(gte(refunds.createdAt, from), ne(refunds.status, "failed"))),
    // Credits issued vs consumed, by ledger type and direction.
    db
      .select({ type: creditLedger.type, plus: sql<number>`coalesce(sum(${creditLedger.credits}) filter (where ${creditLedger.credits} > 0), 0)::int`, minus: sql<number>`coalesce(-sum(${creditLedger.credits}) filter (where ${creditLedger.credits} < 0), 0)::int` })
      .from(creditLedger)
      .where(gte(creditLedger.createdAt, from))
      .groupBy(creditLedger.type),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.createdAt, from))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    adminEmailHealth(db),
  ]);

  const flow = Object.fromEntries(flows.map((f) => [f.type, f])) as Record<string, { plus: number; minus: number }>;
  const generations = n(grounding?.generations) + n(blocked?.jobs);
  const violations = n(grounding?.violations) + n(blocked?.violations);
  return {
    byType,
    grounding: {
      generations,
      violations,
      perHundred: generations ? Math.round((violations / generations) * 1000) / 10 : 0,
      fixedByRetry: n(grounding?.withViolations),
      blocked: n(blocked?.jobs),
    },
    refunds: { paise: n(refunded?.paise), count: n(refunded?.n) },
    credits: {
      issued: {
        purchased: flow.purchase?.plus ?? 0,
        coupon: flow.coupon_credit?.plus ?? 0,
        referral: flow.referral_credit?.plus ?? 0,
        admin: flow.admin_adjustment?.plus ?? 0,
      },
      consumed: flow.capture?.minus ?? 0,
      refunded: flow.refund?.minus ?? 0,
      adminRemoved: flow.admin_adjustment?.minus ?? 0,
    },
    signups,
    email,
  };
}

/** §13.6 admin metrics, last 30 days. Delivery/open rates don't exist over plain SMTP. */
export async function adminEmailHealth(db: Database) {
  const from = since(30);
  const [[sent], [bounced], [unsub]] = await Promise.all([
    db
      .select({ sent: sql<number>`count(*) filter (where ${emailMessages.status} = 'sent')::int`, failed: sql<number>`count(*) filter (where ${emailMessages.status} = 'failed')::int` })
      .from(emailMessages)
      .where(gte(emailMessages.createdAt, from)),
    db.select({ n: count() }).from(emailSuppressions).where(and(eq(emailSuppressions.reason, "hard_bounce"), gte(emailSuppressions.createdAt, from))),
    db.select({ n: count() }).from(emailEvents).where(and(eq(emailEvents.eventType, "unsubscribed"), gte(emailEvents.createdAt, from))),
  ]);
  return { sent: n(sent?.sent), failed: n(sent?.failed), hardBounced: n(bounced?.n), unsubscribed: n(unsub?.n) };
}

/** Extra sections for the admin user page: payments + refunds, email status (full address lives here only). */
export async function adminUserExtras(db: Database, userId: string) {
  const [pays, [suppression], [prefs], recentEmail] = await Promise.all([
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        paymentId: payments.paymentId,
        amountPaise: payments.amountPaise,
        credits: payments.credits,
        status: payments.status,
        createdAt: payments.createdAt,
        refundPaise: refunds.amountPaise,
        refundStatus: refunds.status,
      })
      .from(payments)
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(20),
    db
      .select({ reason: emailSuppressions.reason, createdAt: emailSuppressions.createdAt })
      .from(emailSuppressions)
      .innerJoin(users, sql`lower(${emailSuppressions.email}) = lower(${users.email})`)
      .where(eq(users.id, userId)),
    db.select({ reminders: emailPreferences.reminders, productUpdates: emailPreferences.productUpdates, consentSource: emailPreferences.consentSource }).from(emailPreferences).where(eq(emailPreferences.userId, userId)),
    db
      .select({ templateKey: emailMessages.templateKey, status: emailMessages.status, error: emailMessages.error, createdAt: emailMessages.createdAt })
      .from(emailMessages)
      .where(eq(emailMessages.userId, userId))
      .orderBy(desc(emailMessages.createdAt))
      .limit(10),
  ]);
  return { payments: pays, suppression: suppression ?? null, prefs: prefs ?? null, recentEmail };
}

/**
 * Resume content for an admin, only with a reason — every view writes an
 * `audit_logs` row first (prd.md §12.2 "logged admin access", §14.2).
 */
export async function adminViewResumeContent(
  db: Database,
  input: { adminUserId: string; userId: string; versionId: string; reason: string },
): Promise<{ content: Resume; fileName: string; kind: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new RangeError("Viewing resume content needs a reason");
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select({ content: resumeVersions.content, kind: resumeVersions.kind, fileName: resumes.fileName })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(and(eq(resumeVersions.id, input.versionId), eq(resumes.userId, input.userId)));
    if (!v) throw new RangeError("Version not found");
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "resume.view_content",
      targetType: "resume_version",
      targetId: input.versionId,
      reason,
      metadata: { userId: input.userId },
    });
    return { content: resumeSchema.parse(v.content), fileName: v.fileName, kind: v.kind };
  });
}

/** Minimum successful runs before a typical number is published on /pricing (§3.6: only measured numbers). */
export const TYPICAL_CREDITS_MIN_RUNS = 20;

/**
 * Median credits actually charged per action over the last 30 days
 * (prd.md §3.6). Only types with enough runs are returned, so the public
 * Pricing page never shows a number from a handful of samples.
 */
export async function typicalCreditsPerAction(db: Database, minRuns = TYPICAL_CREDITS_MIN_RUNS): Promise<Record<string, number>> {
  const rows = await db
    .select({ type: aiJobs.type, runs: count(), median: sql<number>`percentile_cont(0.5) within group (order by ${aiJobs.creditsCharged})` })
    .from(aiJobs)
    .where(and(eq(aiJobs.status, "succeeded"), gte(aiJobs.createdAt, since(30)), sql`${aiJobs.creditsCharged} is not null`))
    .groupBy(aiJobs.type);
  return Object.fromEntries(rows.filter((r) => r.runs >= minRuns).map((r) => [r.type, Math.round(Number(r.median))]));
}
