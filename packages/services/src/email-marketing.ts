import {
  atsReports,
  auditLogs,
  codeRedemptions,
  creditAccounts,
  creditLedger,
  emailCampaigns,
  emailMessages,
  emailPreferences,
  emailSuppressions,
  jobDescriptions,
  resumes,
  resumeVersions,
  users,
  type Database,
} from "@resume-pilot/database";
import { InactiveNudgeEmail, inactiveNudgeEmailSubject, NewFeaturesEmail, type FeatureItem } from "@resume-pilot/emails";
import { marketingIdempotencyKey, type MarketingEmailJob } from "@resume-pilot/queue";
import { and, count, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { deliverOnce, findUser, links, type EmailProcessContext, type EmailProcessResult, type SendFn } from "./email";
import { signUnsubscribeToken, unsubscribeUrl } from "./email-prefs";

/**
 * Marketing email — prd.md §13.2, §13.4, §13.5.
 *
 * Exclusions are applied twice: when the audience is counted/frozen, and
 * again for every recipient at send time inside `deliverOnce` (consent,
 * any suppression, template switch), so an unsubscribe mid-send stops
 * the rest. Suspended users never get marketing.
 */

// ─── Merge fields ──────────────────────────────────────────────────────────

/** {first_name} {balance} {credits} {amount} {payment_id} {referral_code} {segment_reason} — unknown fields render empty. */
export function applyMergeFields(text: string, data: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_m, k: string) => (data[k] === null || data[k] === undefined ? "" : String(data[k])));
}

// ─── Audience (§13.4) ──────────────────────────────────────────────────────

export const audienceFiltersSchema = z
  .object({
    signedInWithinDays: z.number().int().min(1).max(3650).optional(),
    inactiveForDays: z.number().int().min(1).max(3650).optional(),
    minTailored: z.number().int().min(1).max(10_000).optional(),
    toppedUp: z.enum(["never", "ever"]).optional(),
    usedCode: z.boolean().optional(),
    joinedAfter: z.coerce.date().optional(),
    joinedBefore: z.coerce.date().optional(),
    balanceBelow: z.number().int().min(1).optional(),
  })
  .strict();
export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;

const DAY = 86_400_000;

function filterConditions(f: AudienceFilters, now: Date): SQL[] {
  const c: SQL[] = [];
  if (f.signedInWithinDays) c.push(gte(users.lastActiveAt, new Date(now.getTime() - f.signedInWithinDays * DAY)));
  if (f.inactiveForDays) c.push(lt(users.lastActiveAt, new Date(now.getTime() - f.inactiveForDays * DAY)));
  if (f.minTailored)
    c.push(sql`(select count(*) from ${resumeVersions} rv join ${resumes} r on r.id = rv.resume_id where r.user_id = ${users.id} and rv.kind = 'generated' and rv.deleted_at is null) >= ${f.minTailored}`);
  const toppedUp = sql`exists (select 1 from ${creditLedger} l where l.user_id = ${users.id} and l.type = 'purchase')`;
  if (f.toppedUp === "never") c.push(sql`not ${toppedUp}`);
  if (f.toppedUp === "ever") c.push(toppedUp);
  const used = sql`exists (select 1 from ${codeRedemptions} cr where cr.user_id = ${users.id})`;
  if (f.usedCode === true) c.push(used);
  if (f.usedCode === false) c.push(sql`not ${used}`);
  if (f.joinedAfter) c.push(gte(users.createdAt, f.joinedAfter));
  if (f.joinedBefore) c.push(lt(users.createdAt, f.joinedBefore));
  if (f.balanceBelow) c.push(sql`coalesce((select balance from ${creditAccounts} ca where ca.user_id = ${users.id}), 0) < ${f.balanceBelow}`);
  return c;
}

/** Always-on exclusions for product-update campaigns. */
const eligible = and(
  eq(users.status, "active"),
  sql`exists (select 1 from ${emailPreferences} p where p.user_id = ${users.id} and p.product_updates)`,
  sql`not exists (select 1 from ${emailSuppressions} s where lower(s.email) = lower(${users.email}))`,
)!;

/** Live count for the composer: who matches the filters, and how many of those are left out by the exclusions. */
export async function countAudience(db: Database, filters: AudienceFilters, now = new Date()) {
  const f = audienceFiltersSchema.parse(filters);
  const conds = filterConditions(f, now);
  const [matched] = await db.select({ n: count() }).from(users).where(and(...conds));
  const [ok] = await db.select({ n: count() }).from(users).where(and(eligible, ...conds));
  return { recipients: ok?.n ?? 0, excluded: (matched?.n ?? 0) - (ok?.n ?? 0) };
}

async function audienceIds(db: Pick<Database, "select">, filters: AudienceFilters, now: Date): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(and(eligible, ...filterConditions(filters, now)));
  return rows.map((r) => r.id);
}

// ─── Campaigns ─────────────────────────────────────────────────────────────

export const campaignContentSchema = z.object({
  headline: z.string().trim().min(3).max(140),
  features: z
    .array(z.object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(400), ctaLabel: z.string().trim().min(2).max(30), ctaUrl: z.url() }))
    .min(1)
    .max(3),
});
export type CampaignContent = z.infer<typeof campaignContentSchema>;

export const createCampaignSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  preheader: z.string().trim().max(160).optional(),
  content: campaignContentSchema,
  filters: audienceFiltersSchema,
  /** Null = send now. */
  scheduledAt: z.coerce.date().nullable(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignError";
  }
}

export type EnqueueMarketing = (jobs: MarketingEmailJob[]) => Promise<unknown>;

/** Creates a campaign (audited). Scheduled ones are started by `dispatchDueCampaigns`; "now" starts here. */
export async function createCampaign(db: Database, input: CreateCampaignInput & { adminUserId: string }, enqueue: EnqueueMarketing, now = new Date()) {
  const data = createCampaignSchema.parse(input);
  if (data.scheduledAt && data.scheduledAt.getTime() < now.getTime() - 60_000) throw new CampaignError("The scheduled time is in the past");
  const [c] = await db
    .insert(emailCampaigns)
    .values({
      templateKey: "new_features",
      audienceFilters: data.filters,
      subject: data.subject,
      preheader: data.preheader ?? null,
      content: data.content,
      status: data.scheduledAt ? "scheduled" : "draft",
      scheduledAt: data.scheduledAt,
      createdBy: input.adminUserId,
    })
    .returning();
  await db.insert(auditLogs).values({
    adminUserId: input.adminUserId,
    action: data.scheduledAt ? "campaign.schedule" : "campaign.send",
    targetType: "email_campaign",
    targetId: c!.id,
    reason: `Campaign “${data.subject}”`,
    metadata: { filters: data.filters, scheduledAt: data.scheduledAt?.toISOString() ?? null },
  });
  if (!data.scheduledAt) return startCampaign(db, c!.id, enqueue, now);
  return { campaignId: c!.id, status: "scheduled" as const, recipients: null };
}

export async function cancelCampaign(db: Database, input: { adminUserId: string; campaignId: string; reason: string }) {
  const [c] = await db
    .update(emailCampaigns)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(emailCampaigns.id, input.campaignId), inArray(emailCampaigns.status, ["draft", "scheduled"])))
    .returning({ id: emailCampaigns.id });
  if (!c) throw new CampaignError("Only a campaign that hasn't started can be cancelled");
  await db.insert(auditLogs).values({ adminUserId: input.adminUserId, action: "campaign.cancel", targetType: "email_campaign", targetId: c.id, reason: input.reason });
}

/**
 * Freezes the audience and queues one job per recipient (§13.4: "the
 * audience is frozen when sending starts"). The status flip is a
 * conditional update, so two dispatchers can't start the same campaign.
 */
export async function startCampaign(db: Database, campaignId: string, enqueue: EnqueueMarketing, now = new Date()) {
  const started = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(emailCampaigns)
      .set({ status: "sending", startedAt: now, updatedAt: now })
      .where(and(eq(emailCampaigns.id, campaignId), inArray(emailCampaigns.status, ["draft", "scheduled"])))
      .returning();
    if (!c) return null;
    const ids = await audienceIds(tx, audienceFiltersSchema.parse(c.audienceFilters), now);
    await tx.update(emailCampaigns).set({ recipientCount: ids.length, sentCount: 0, skippedCount: 0 }).where(eq(emailCampaigns.id, c.id));
    return { ids };
  });
  if (!started) throw new CampaignError("This campaign has already started or was cancelled");
  await enqueue(started.ids.map((userId) => ({ templateKey: "new_features" as const, userId, campaignId })));
  if (started.ids.length === 0) await db.update(emailCampaigns).set({ status: "sent", finishedAt: now }).where(eq(emailCampaigns.id, campaignId));
  return { campaignId, status: "sending" as const, recipients: started.ids.length };
}

/** Every minute: start due scheduled campaigns, and close sending ones whose every recipient has a final status. */
export async function dispatchDueCampaigns(db: Database, enqueue: EnqueueMarketing, now = new Date()) {
  const due = await db
    .select({ id: emailCampaigns.id })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.status, "scheduled"), lt(emailCampaigns.scheduledAt, new Date(now.getTime() + 1000))));
  let started = 0;
  for (const c of due) {
    try {
      await startCampaign(db, c.id, enqueue, now);
      started++;
    } catch (err) {
      if (!(err instanceof CampaignError)) throw err;
    }
  }

  const sending = await db.select().from(emailCampaigns).where(eq(emailCampaigns.status, "sending"));
  let finished = 0;
  for (const c of sending) {
    const rows = await db
      .select({ status: emailMessages.status, n: count() })
      .from(emailMessages)
      .where(eq(emailMessages.campaignId, c.id))
      .groupBy(emailMessages.status);
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const sent = by.sent ?? 0;
    const skipped = (by.skipped ?? 0) + (by.failed ?? 0);
    const done = sent + skipped >= (c.recipientCount ?? 0);
    await db
      .update(emailCampaigns)
      .set({ sentCount: sent, skippedCount: skipped, ...(done ? { status: "sent" as const, finishedAt: now } : {}), updatedAt: now })
      .where(eq(emailCampaigns.id, c.id));
    if (done) finished++;
  }
  return { started, finished };
}

export async function listCampaigns(db: Database, limit = 50) {
  return db.select().from(emailCampaigns).orderBy(sql`${emailCampaigns.createdAt} desc`).limit(limit);
}

const monthLabel = (d: Date) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d).toUpperCase();

function renderCampaign(
  c: { subject: string; preheader: string | null; content: unknown },
  merge: Record<string, string | number | null>,
  l: ReturnType<typeof links>,
  unsubUrl: string,
) {
  const content = campaignContentSchema.parse(c.content);
  const features: FeatureItem[] = content.features.map((f) => ({ title: applyMergeFields(f.title, merge), body: applyMergeFields(f.body, merge), ctaLabel: f.ctaLabel, ctaUrl: f.ctaUrl }));
  return {
    subject: applyMergeFields(c.subject, merge),
    element: NewFeaturesEmail({
      firstName: String(merge.first_name ?? "there"),
      monthLabel: monthLabel(new Date()),
      headline: applyMergeFields(content.headline, merge),
      features,
      preheader: c.preheader ? applyMergeFields(c.preheader, merge) : undefined,
      unsubscribeUrl: unsubUrl,
      links: l,
    }),
  };
}

/** "Send test to me" (§13.4): the admin's own address and merge data; not logged as a campaign send. */
export async function sendCampaignTest(db: Database, input: { adminUserId: string; subject: string; preheader?: string; content: CampaignContent }, ctx: Pick<EmailProcessContext, "appUrl" | "supportEmail" | "postalAddress" | "logoUrl"> & { send: SendFn }) {
  const admin = await findUser(db, input.adminUserId);
  if (!admin) throw new CampaignError("Admin not found");
  const merge = await mergeDataFor(db, admin.id, admin.firstName);
  const r = renderCampaign({ subject: `[Test] ${input.subject}`, preheader: input.preheader ?? null, content: campaignContentSchema.parse(input.content) }, merge, links({ ...ctx, launchCouponCode: "", isFinalAttempt: true, send: ctx.send }), unsubscribeUrl(ctx.appUrl, admin.id, "productUpdates"));
  await ctx.send({ to: admin.email, ...r });
  return { to: admin.email };
}

async function mergeDataFor(db: Database, userId: string, firstName: string | null) {
  const [a] = await db.select({ balance: creditAccounts.balance }).from(creditAccounts).where(eq(creditAccounts.userId, userId));
  return { first_name: firstName || "there", balance: a?.balance ?? 0 };
}

// ─── Inactive nudge (§13.1) ────────────────────────────────────────────────

export const NUDGE_EVERY_DAYS = 30;
export const MAX_NUDGES = 3;

/**
 * Daily: one job per user due a nudge. Nudge n is due once the user has
 * been away n × 30 days (max 3 per absence; signing in resets the
 * clock). After the first nudge, users with no credits and no top-up ever
 * are skipped. Consent etc. are re-checked at send time.
 */
export async function findInactiveNudges(db: Database, now = new Date()): Promise<MarketingEmailJob[]> {
  const cutoff = new Date(now.getTime() - NUDGE_EVERY_DAYS * DAY);
  const rows = await db
    .select({ id: users.id, lastActiveAt: users.lastActiveAt, balance: sql<number>`coalesce(${creditAccounts.balance}, 0)`.mapWith(Number), toppedUp: sql<boolean>`exists (select 1 from ${creditLedger} l where l.user_id = ${users.id} and l.type = 'purchase')` })
    .from(users)
    .leftJoin(creditAccounts, eq(creditAccounts.userId, users.id))
    .where(and(eq(users.status, "active"), lt(users.lastActiveAt, cutoff), sql`exists (select 1 from ${emailPreferences} p where p.user_id = ${users.id} and p.reminders)`));
  const jobs: MarketingEmailJob[] = [];
  for (const r of rows) {
    const nudge = Math.min(MAX_NUDGES, Math.floor((now.getTime() - r.lastActiveAt.getTime()) / (NUDGE_EVERY_DAYS * DAY)));
    if (nudge > 1 && r.balance <= 0 && !r.toppedUp) continue;
    jobs.push({ templateKey: "inactive_nudge", userId: r.id, activeAtMs: r.lastActiveAt.getTime(), nudge });
  }
  if (jobs.length === 0) return jobs;
  // Drop ones already logged (any status): each key is sent at most once.
  const keys = jobs.map(marketingIdempotencyKey);
  const seen = new Set((await db.select({ k: emailMessages.idempotencyKey }).from(emailMessages).where(inArray(emailMessages.idempotencyKey, keys))).map((r) => r.k));
  return jobs.filter((j) => !seen.has(marketingIdempotencyKey(j)));
}

/** Touches users.last_active_at at most hourly (one cheap conditional update per page view). */
export async function touchUserActivity(db: Database, userId: string, firstName?: string | null, now = new Date()) {
  await db
    .update(users)
    .set({ lastActiveAt: now, ...(firstName ? { firstName: firstName.trim().slice(0, 100) } : {}) })
    .where(and(eq(users.id, userId), lt(users.lastActiveAt, new Date(now.getTime() - 3_600_000))));
}

// ─── Marketing send ────────────────────────────────────────────────────────

function unsubHeaders(appUrl: string, userId: string, scope: "reminders" | "productUpdates") {
  const oneClick = `${appUrl.replace(/\/$/, "")}/api/email/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(userId, scope))}`;
  // RFC 8058 one-click: Gmail/Yahoo POST to this URL with List-Unsubscribe=One-Click.
  return { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export async function processMarketingEmail(db: Database, job: MarketingEmailJob, ctx: EmailProcessContext): Promise<EmailProcessResult> {
  const user = await findUser(db, job.userId);
  if (!user) return { status: "skipped", reason: "user not found" };
  const l = links(ctx);
  const idempotencyKey = marketingIdempotencyKey(job);

  if (job.templateKey === "new_features") {
    const [c] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, job.campaignId));
    if (!c || c.status === "cancelled") return { status: "skipped", reason: "campaign cancelled" };
    const merge = await mergeDataFor(db, user.id, user.firstName);
    return deliverOnce(db, ctx, {
      idempotencyKey,
      templateKey: "new_features",
      user,
      skipSuspended: true,
      marketing: { category: "productUpdates", campaignId: c.id },
      queuedMergeData: merge,
      render: async () => ({ ...renderCampaign(c, merge, l, unsubscribeUrl(ctx.appUrl, user.id, "productUpdates")), headers: unsubHeaders(ctx.appUrl, user.id, "productUpdates"), mergeData: merge }),
    });
  }

  // inactive_nudge: only if the user is still in the same absence.
  const [u] = await db.select({ lastActiveAt: users.lastActiveAt }).from(users).where(eq(users.id, user.id));
  if (!u || u.lastActiveAt.getTime() !== job.activeAtMs) return { status: "skipped", reason: "user came back" };
  const [stats] = await db
    .select({
      balance: sql<number>`coalesce((select balance from ${creditAccounts} where user_id = ${user.id}), 0)`.mapWith(Number),
      tailored: sql<number>`(select count(*) from ${resumeVersions} rv join ${resumes} r on r.id = rv.resume_id where r.user_id = ${user.id} and rv.kind = 'generated' and rv.deleted_at is null)`.mapWith(Number),
      best: sql<number | null>`(select max(a.overall_score) from ${atsReports} a join ${resumeVersions} rv on rv.id = a.version_id join ${resumes} r on r.id = rv.resume_id where r.user_id = ${user.id})`,
      jobs: sql<number>`(select count(*) from ${jobDescriptions} where user_id = ${user.id})`.mapWith(Number),
    })
    .from(sql`(select 1) as one`);
  const merge = { first_name: user.firstName || "there", balance: stats?.balance ?? 0, nudge: job.nudge, last_active: u.lastActiveAt.toISOString() };
  return deliverOnce(db, ctx, {
    idempotencyKey,
    templateKey: "inactive_nudge",
    user,
    skipSuspended: true,
    marketing: { category: "reminders" },
    queuedMergeData: merge,
    render: async () => ({
      subject: inactiveNudgeEmailSubject(),
      element: InactiveNudgeEmail({
        firstName: merge.first_name,
        balance: merge.balance,
        tailoredVersions: stats?.tailored ?? 0,
        bestScore: stats?.best === null || stats?.best === undefined ? null : Number(stats.best),
        savedJobs: stats?.jobs ?? 0,
        unsubscribeUrl: unsubscribeUrl(ctx.appUrl, user.id, "reminders"),
        links: l,
      }),
      headers: unsubHeaders(ctx.appUrl, user.id, "reminders"),
      mergeData: merge,
    }),
  });
}
