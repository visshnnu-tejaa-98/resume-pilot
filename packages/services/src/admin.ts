import {
  aiJobs,
  auditLogs,
  codeRedemptions,
  coupons,
  creditAccounts,
  creditHolds,
  creditLedger,
  emailMessages,
  emailTemplateSettings,
  paymentEvents,
  payments,
  referralCodes,
  resumes,
  resumeTemplates,
  resumeVersions,
  users,
  type Database,
} from "@resume-pilot/database";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql, sum } from "drizzle-orm";

/**
 * Admin read models and audited admin writes (prd.md §2.2, §14).
 *
 * Callers MUST have verified the caller is an admin server-side
 * (`adminProcedure` / `requireAdmin()`); these functions don't re-check.
 * Resume and prompt *content* is never returned here — only metadata.
 * Every write inserts an `audit_logs` row with the admin's reason in the
 * same transaction.
 */

const since = (days: number) => new Date(Date.now() - days * 86_400_000);
const num = (v: unknown) => Number(v ?? 0);

// ─── Overview ────────────────────────────────────────────────────────────

export async function adminOverview(db: Database, days: number) {
  const from = since(days);
  const [
    [usersTotal],
    [usersNew],
    [paying],
    jobsByStatus,
    [revenue],
    [aiCost],
    [outstanding],
    daily,
    econ,
    [failed24h],
    [flagged],
    [pendingPayments],
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, from)),
    db.select({ n: sql<number>`count(distinct ${payments.userId})::int` }).from(payments).where(eq(payments.status, "captured")),
    db
      .select({ status: aiJobs.status, n: count() })
      .from(aiJobs)
      .where(gte(aiJobs.createdAt, from))
      .groupBy(aiJobs.status),
    db
      .select({ paise: sum(payments.amountPaise), n: count() })
      .from(payments)
      .where(and(eq(payments.status, "captured"), gte(payments.createdAt, from))),
    db.select({ paise: sum(aiJobs.costPaise) }).from(aiJobs).where(gte(aiJobs.createdAt, from)),
    db.select({ credits: sum(creditAccounts.balance) }).from(creditAccounts),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${aiJobs.createdAt}), 'YYYY-MM-DD')`,
        ok: sql<number>`count(*) filter (where ${aiJobs.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${aiJobs.status} = 'failed')::int`,
      })
      .from(aiJobs)
      .where(gte(aiJobs.createdAt, from))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        type: aiJobs.type,
        runs: count(),
        avgTokens: sql<number>`coalesce(avg(coalesce(${aiJobs.inputTokens},0) + coalesce(${aiJobs.outputTokens},0)),0)::int`,
        avgCostPaise: sql<number>`coalesce(avg(${aiJobs.costPaise}),0)::float`,
        avgCredits: sql<number>`coalesce(avg(${aiJobs.creditsCharged}),0)::float`,
      })
      .from(aiJobs)
      .where(and(gte(aiJobs.createdAt, from), eq(aiJobs.status, "succeeded")))
      .groupBy(aiJobs.type),
    db.select({ n: count() }).from(aiJobs).where(and(eq(aiJobs.status, "failed"), gte(aiJobs.createdAt, since(1)))),
    db.select({ n: count() }).from(codeRedemptions).where(eq(codeRedemptions.referrerStatus, "held")),
    db.select({ n: count() }).from(payments).where(eq(payments.status, "created")),
  ]);

  const jobs = Object.fromEntries(jobsByStatus.map((r) => [r.status, r.n])) as Record<string, number>;
  const totalJobs = Object.values(jobs).reduce((a, b) => a + b, 0);
  return {
    users: num(usersTotal?.n),
    newUsers: num(usersNew?.n),
    payingUsers: num(paying?.n),
    aiActions: totalJobs,
    aiFailed: jobs.failed ?? 0,
    revenuePaise: num(revenue?.paise),
    paymentsCount: num(revenue?.n),
    aiCostPaise: num(aiCost?.paise),
    outstandingCredits: num(outstanding?.credits),
    daily,
    econ,
    alerts: {
      failedLast24h: num(failed24h?.n),
      flaggedReferrals: num(flagged?.n),
      pendingPayments: num(pendingPayments?.n),
    },
  };
}

/** Sidebar badge counts. */
export async function adminBadges(db: Database) {
  const [[failed], [flagged]] = await Promise.all([
    db.select({ n: count() }).from(aiJobs).where(and(eq(aiJobs.status, "failed"), gte(aiJobs.createdAt, since(1)))),
    db.select({ n: count() }).from(codeRedemptions).where(eq(codeRedemptions.referrerStatus, "held")),
  ]);
  return { aiJobs: num(failed?.n), coupons: num(flagged?.n) };
}

// ─── Users ───────────────────────────────────────────────────────────────

export interface AdminUserFilters {
  q?: string;
  status?: "active" | "suspended";
  payer?: "yes" | "no";
  limit?: number;
  offset?: number;
}

export async function adminListUsers(db: Database, f: AdminUserFilters = {}) {
  const limit = Math.min(f.limit ?? 25, 100);
  const topups = sql<number>`(select count(*)::int from ${payments} where ${payments.userId} = ${users.id} and ${payments.status} = 'captured')`;
  const conds = [
    f.q ? or(ilike(users.email, `%${f.q}%`), sql`${users.id}::text = ${f.q}`) : undefined,
    f.status ? eq(users.status, f.status) : undefined,
    f.payer === "yes" ? sql`${topups} > 0` : f.payer === "no" ? sql`${topups} = 0` : undefined,
  ].filter(Boolean);
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        balance: sql<number>`coalesce(${creditAccounts.balance}, 0)`.mapWith(Number),
        topups,
        aiActions: sql<number>`(select count(*)::int from ${aiJobs} where ${aiJobs.userId} = ${users.id})`,
        code: sql<string | null>`(select coalesce(c.code, r.code) from ${codeRedemptions} cr left join ${coupons} c on c.id = cr.coupon_id left join ${referralCodes} r on r.id = cr.referral_code_id where cr.user_id = ${users.id} limit 1)`,
      })
      .from(users)
      .leftJoin(creditAccounts, eq(creditAccounts.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(f.offset ?? 0),
    db.select({ n: count() }).from(users).where(where),
  ]);
  return { rows, total: num(total?.n) };
}

export async function adminGetUser(db: Database, userId: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const [[account], [held], [paid], [used], jobs, ledger, [redemption], versions] = await Promise.all([
    db.select({ balance: creditAccounts.balance }).from(creditAccounts).where(eq(creditAccounts.userId, userId)),
    db.select({ n: sum(creditHolds.amount) }).from(creditHolds).where(and(eq(creditHolds.userId, userId), eq(creditHolds.status, "active"))),
    db
      .select({ paise: sum(payments.amountPaise), n: count() })
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.status, "captured"))),
    db
      .select({ credits: sql<number>`coalesce(-sum(${creditLedger.credits}),0)::int`, n: count() })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "capture"))),
    db
      .select({
        id: aiJobs.id,
        type: aiJobs.type,
        status: aiJobs.status,
        createdAt: aiJobs.createdAt,
        durationMs: sql<number>`(extract(epoch from (${aiJobs.updatedAt} - ${aiJobs.createdAt})) * 1000)::int`,
      })
      .from(aiJobs)
      .where(eq(aiJobs.userId, userId))
      .orderBy(desc(aiJobs.createdAt))
      .limit(8),
    db
      .select({
        id: creditLedger.id,
        type: creditLedger.type,
        credits: creditLedger.credits,
        balanceAfter: creditLedger.balanceAfter,
        sourceType: creditLedger.sourceType,
        sourceId: creditLedger.sourceId,
        note: creditLedger.note,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(8),
    db
      .select({
        code: sql<string | null>`coalesce(${coupons.code}, ${referralCodes.code})`,
        creditsToUser: codeRedemptions.creditsToUser,
        createdAt: codeRedemptions.createdAt,
      })
      .from(codeRedemptions)
      .leftJoin(coupons, eq(coupons.id, codeRedemptions.couponId))
      .leftJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId))
      .where(eq(codeRedemptions.userId, userId)),
    // Metadata only — content stays hidden (§14.2).
    db
      .select({ id: resumeVersions.id, kind: resumeVersions.kind, fileName: resumes.fileName, updatedAt: resumeVersions.updatedAt })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(and(eq(resumes.userId, userId), isNull(resumeVersions.deletedAt)))
      .orderBy(desc(resumeVersions.updatedAt))
      .limit(20),
  ]);

  return {
    user,
    balance: num(account?.balance),
    held: num(held?.n),
    paidPaise: num(paid?.paise),
    topups: num(paid?.n),
    creditsUsed: num(used?.credits),
    chargedActions: num(used?.n),
    jobs,
    ledger,
    redemption: redemption ?? null,
    versions,
  };
}

/** Suspend or reinstate an account, with the reason in the audit log. */
export async function adminSetUserStatus(
  db: Database,
  input: { adminUserId: string; userId: string; status: "active" | "suspended"; reason: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new RangeError("A status change needs a reason");
  if (input.adminUserId === input.userId) throw new RangeError("You can't change your own account status");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning({ id: users.id });
    if (!row) throw new RangeError("User not found");
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: input.status === "suspended" ? "user.suspend" : "user.reinstate",
      targetType: "user",
      targetId: input.userId,
      reason,
    });
    return { status: input.status };
  });
}

// ─── AI jobs ─────────────────────────────────────────────────────────────

export async function adminListAiJobs(
  db: Database,
  f: { status?: "pending" | "running" | "succeeded" | "failed"; type?: "jd_analysis" | "generation" | "ats_scoring"; limit?: number } = {},
) {
  const conds = [f.status ? eq(aiJobs.status, f.status) : undefined, f.type ? eq(aiJobs.type, f.type) : undefined].filter(Boolean);
  const [rows, [queue]] = await Promise.all([
    db
      .select({
        id: aiJobs.id,
        type: aiJobs.type,
        status: aiJobs.status,
        userId: aiJobs.userId,
        userEmail: users.email,
        model: aiJobs.model,
        inputTokens: aiJobs.inputTokens,
        outputTokens: aiJobs.outputTokens,
        costPaise: aiJobs.costPaise,
        creditsEstimated: aiJobs.creditsEstimated,
        creditsCharged: aiJobs.creditsCharged,
        error: aiJobs.error,
        createdAt: aiJobs.createdAt,
        durationMs: sql<number>`(extract(epoch from (${aiJobs.updatedAt} - ${aiJobs.createdAt})) * 1000)::int`,
      })
      .from(aiJobs)
      .innerJoin(users, eq(users.id, aiJobs.userId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(aiJobs.createdAt))
      .limit(Math.min(f.limit ?? 50, 200)),
    db
      .select({
        running: sql<number>`count(*) filter (where ${aiJobs.status} = 'running')::int`,
        waiting: sql<number>`count(*) filter (where ${aiJobs.status} = 'pending')::int`,
      })
      .from(aiJobs),
  ]);
  return { rows, running: num(queue?.running), waiting: num(queue?.waiting) };
}

export async function adminGetAiJob(db: Database, jobId: string) {
  const [job] = await db
    .select({
      id: aiJobs.id,
      type: aiJobs.type,
      status: aiJobs.status,
      userId: aiJobs.userId,
      userEmail: users.email,
      model: aiJobs.model,
      inputTokens: aiJobs.inputTokens,
      outputTokens: aiJobs.outputTokens,
      costPaise: aiJobs.costPaise,
      creditsEstimated: aiJobs.creditsEstimated,
      creditsCharged: aiJobs.creditsCharged,
      pricingConfigVersion: aiJobs.pricingConfigVersion,
      idempotencyKey: aiJobs.idempotencyKey,
      error: aiJobs.error,
      createdAt: aiJobs.createdAt,
      updatedAt: aiJobs.updatedAt,
    })
    .from(aiJobs)
    .innerJoin(users, eq(users.id, aiJobs.userId))
    .where(eq(aiJobs.id, jobId));
  if (!job) return null;
  const [hold] = await db
    .select({ amount: creditHolds.amount, status: creditHolds.status, createdAt: creditHolds.createdAt, updatedAt: creditHolds.updatedAt })
    .from(creditHolds)
    .where(eq(creditHolds.aiJobId, jobId));
  return { job, hold: hold ?? null };
}

// ─── Ledger ──────────────────────────────────────────────────────────────

export async function adminLedger(db: Database, limit = 50) {
  const [entries, totals, holds] = await Promise.all([
    db
      .select({
        id: creditLedger.id,
        userId: creditLedger.userId,
        userEmail: users.email,
        type: creditLedger.type,
        credits: creditLedger.credits,
        balanceAfter: creditLedger.balanceAfter,
        sourceType: creditLedger.sourceType,
        sourceId: creditLedger.sourceId,
        note: creditLedger.note,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .innerJoin(users, eq(users.id, creditLedger.userId))
      .orderBy(desc(creditLedger.createdAt))
      .limit(Math.min(limit, 200)),
    db.select({ type: creditLedger.type, total: sum(creditLedger.credits) }).from(creditLedger).groupBy(creditLedger.type),
    db
      .select({
        id: creditHolds.id,
        userId: creditHolds.userId,
        userEmail: users.email,
        aiJobId: creditHolds.aiJobId,
        amount: creditHolds.amount,
        expiresAt: creditHolds.expiresAt,
      })
      .from(creditHolds)
      .innerJoin(users, eq(users.id, creditHolds.userId))
      .where(eq(creditHolds.status, "active"))
      .orderBy(creditHolds.expiresAt),
  ]);
  const byType = Object.fromEntries(totals.map((t) => [t.type, num(t.total)])) as Record<string, number>;
  return { entries, byType, holds };
}

// ─── Payments ────────────────────────────────────────────────────────────

export async function adminPayments(db: Database, limit = 50) {
  const [rows, stats] = await Promise.all([
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        paymentId: payments.paymentId,
        userId: payments.userId,
        userEmail: users.email,
        amountPaise: payments.amountPaise,
        credits: payments.credits,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .orderBy(desc(payments.createdAt))
      .limit(Math.min(limit, 200)),
    db.select({ status: payments.status, n: count(), paise: sum(payments.amountPaise) }).from(payments).groupBy(payments.status),
  ]);
  const events = rows.length
    ? await db
        .select({ paymentId: paymentEvents.paymentId, eventType: paymentEvents.eventType, createdAt: paymentEvents.createdAt })
        .from(paymentEvents)
        .where(inArray(paymentEvents.paymentId, rows.map((r) => r.id)))
        .orderBy(paymentEvents.createdAt)
    : [];
  const s = Object.fromEntries(stats.map((r) => [r.status, { n: num(r.n), paise: num(r.paise) }])) as Record<string, { n: number; paise: number }>;
  return { rows, events, stats: s };
}

// ─── Email ───────────────────────────────────────────────────────────────

export async function adminEmailStats(db: Database) {
  const from = since(30);
  const [byTemplate, byStatus, settings] = await Promise.all([
    db
      .select({ templateKey: emailMessages.templateKey, n: count() })
      .from(emailMessages)
      .where(gte(emailMessages.createdAt, from))
      .groupBy(emailMessages.templateKey),
    db.select({ status: emailMessages.status, n: count() }).from(emailMessages).where(gte(emailMessages.createdAt, from)).groupBy(emailMessages.status),
    db.select({ templateKey: emailTemplateSettings.templateKey, enabled: emailTemplateSettings.enabled }).from(emailTemplateSettings),
  ]);
  return {
    sentByTemplate: Object.fromEntries(byTemplate.map((r) => [r.templateKey, num(r.n)])) as Record<string, number>,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, num(r.n)])) as Record<string, number>,
    enabled: Object.fromEntries(settings.map((r) => [r.templateKey, r.enabled])) as Record<string, boolean>,
  };
}

export async function adminEmailLog(db: Database, f: { status?: string; q?: string; limit?: number } = {}) {
  const conds = [
    f.status ? sql`${emailMessages.status} = ${f.status}` : undefined,
    f.q ? or(ilike(users.email, `%${f.q}%`), ilike(emailMessages.providerMessageId, `%${f.q}%`)) : undefined,
    gte(emailMessages.createdAt, since(7)),
  ].filter(Boolean);
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: emailMessages.id,
        userId: emailMessages.userId,
        email: users.email,
        templateKey: emailMessages.templateKey,
        status: emailMessages.status,
        error: emailMessages.error,
        providerMessageId: emailMessages.providerMessageId,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .innerJoin(users, eq(users.id, emailMessages.userId))
      .where(and(...conds))
      .orderBy(desc(emailMessages.createdAt))
      .limit(Math.min(f.limit ?? 100, 500)),
    db
      .select({ status: emailMessages.status, n: count() })
      .from(emailMessages)
      .where(gte(emailMessages.createdAt, since(7)))
      .groupBy(emailMessages.status),
  ]);
  return { rows, counts: Object.fromEntries(counts.map((r) => [r.status, num(r.n)])) as Record<string, number> };
}

/** Marketing template on/off (§13.3). Transactional templates can't be turned off. */
export async function adminSetEmailTemplateEnabled(
  db: Database,
  input: { adminUserId: string; templateKey: string; enabled: boolean; reason: string },
) {
  return db.transaction(async (tx) => {
    await tx
      .insert(emailTemplateSettings)
      .values({ templateKey: input.templateKey, enabled: input.enabled })
      .onConflictDoUpdate({ target: emailTemplateSettings.templateKey, set: { enabled: input.enabled, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "email_template.toggle",
      targetType: "email_template",
      reason: input.reason,
      metadata: { templateKey: input.templateKey, enabled: input.enabled },
    });
  });
}

// ─── Resume templates ────────────────────────────────────────────────────

export async function adminResumeTemplates(db: Database) {
  return db
    .select({
      id: resumeTemplates.id,
      key: resumeTemplates.key,
      name: resumeTemplates.name,
      active: resumeTemplates.active,
      used: sql<number>`(select count(*)::int from ${resumeVersions} where ${resumeVersions.templateId} = ${resumeTemplates.id})`,
    })
    .from(resumeTemplates)
    .orderBy(resumeTemplates.name);
}

export async function adminSetResumeTemplateActive(
  db: Database,
  input: { adminUserId: string; templateId: string; active: boolean; reason: string },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(resumeTemplates)
      .set({ active: input.active })
      .where(eq(resumeTemplates.id, input.templateId))
      .returning({ key: resumeTemplates.key });
    if (!row) throw new RangeError("Template not found");
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "resume_template.toggle",
      targetType: "resume_template",
      targetId: input.templateId,
      reason: input.reason,
      metadata: { key: row.key, active: input.active },
    });
  });
}

// ─── Audit + admins ──────────────────────────────────────────────────────

export async function adminAuditLog(db: Database, f: { action?: string; limit?: number } = {}) {
  return db
    .select({
      id: auditLogs.id,
      adminEmail: users.email,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      reason: auditLogs.reason,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.adminUserId))
    .where(f.action ? ilike(auditLogs.action, `${f.action}%`) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(f.limit ?? 100, 500));
}

export async function adminListAdmins(db: Database) {
  return db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt);
}

// ─── Referrals ───────────────────────────────────────────────────────────

export async function adminReferralStats(db: Database) {
  const [row] = await db
    .select({
      signups: count(),
      toFriends: sum(codeRedemptions.creditsToUser),
      toReferrers: sum(codeRedemptions.creditsToReferrer),
      referrers: sql<number>`count(distinct ${referralCodes.userId})::int`,
    })
    .from(codeRedemptions)
    .innerJoin(referralCodes, eq(referralCodes.id, codeRedemptions.referralCodeId));
  return {
    signups: num(row?.signups),
    creditsGranted: num(row?.toFriends) + num(row?.toReferrers),
    activeReferrers: num(row?.referrers),
  };
}
