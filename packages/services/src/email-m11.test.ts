import { randomUUID } from "node:crypto";
import {
  auditLogs,
  codeRedemptions,
  coupons,
  createDatabase,
  creditAccounts,
  emailCampaigns,
  emailMessages,
  emailPreferences,
  emailSuppressions,
  emailTemplateSettings,
  payments,
  users,
  type Database,
} from "@resume-pilot/database";
import type { MarketingEmailJob, TransactionalEmailJob } from "@resume-pilot/queue";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processTransactionalEmail, type EmailProcessContext } from "./email";
import { checkSendingDomain, sendingDomain, type DnsResolver } from "./email-dns";
import {
  applyMergeFields,
  cancelCampaign,
  countAudience,
  createCampaign,
  dispatchDueCampaigns,
  findInactiveNudges,
  processMarketingEmail,
  touchUserActivity,
} from "./email-marketing";
import { applyUnsubscribe, getEmailPreferences, setEmailPreferences, signUnsubscribeToken, verifyUnsubscribeToken } from "./email-prefs";
import { findMissingTransactionalEmails } from "./email-transactional";
import { grantCredits } from "./ledger";
import { createUserFromClerkWebhook } from "./user";

process.env.EMAIL_UNSUBSCRIBE_SECRET ??= `test-${randomUUID()}`;

describe("merge fields and tokens", () => {
  it("fills known fields and blanks unknown ones", () => {
    expect(applyMergeFields("Hi {first_name}, you have {balance} credits{nope}", { first_name: "Asha", balance: 600 })).toBe("Hi Asha, you have 600 credits");
  });
  it("unsubscribe tokens verify for their user and scope only", () => {
    const id = randomUUID();
    const t = signUnsubscribeToken(id, "reminders");
    expect(verifyUnsubscribeToken(t)).toEqual({ userId: id, scope: "reminders" });
    expect(verifyUnsubscribeToken(t.replace("reminders", "all"))).toBeNull();
    expect(verifyUnsubscribeToken(t.replace(id, randomUUID()))).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("sending-domain DNS checks (§13.7)", () => {
  const fake = (records: Record<string, string[]>, cnames: Record<string, string> = {}): DnsResolver => ({
    resolveTxt: async (h) => {
      if (records[h]) return records[h]!.map((r) => [r]);
      throw Object.assign(new Error("nf"), { code: "ENOTFOUND" });
    },
    resolveCname: async (h) => {
      if (cnames[h]) return [cnames[h]!];
      throw Object.assign(new Error("nf"), { code: "ENOTFOUND" });
    },
  });
  it("reads the domain from the From header", () => {
    expect(sendingDomain("Resume Pilot <noreply@mail.example.com>")).toBe("mail.example.com");
    expect(sendingDomain(undefined)).toBeNull();
  });
  it("verifies SPF, DKIM (TXT or CNAME) and DMARC, falling back to the parent domain for DMARC", async () => {
    const r = await checkSendingDomain(
      { fromAddress: "x <noreply@mail.example.com>", dkimSelector: "s1" },
      fake({ "mail.example.com": ["v=spf1 include:_spf.provider.com ~all"], "_dmarc.example.com": ["v=DMARC1; p=quarantine"] }, { "s1._domainkey.mail.example.com": "s1.dkim.provider.com" }),
    );
    expect(r.checks.map((c) => [c.name, c.status])).toEqual([
      ["SPF", "verified"],
      ["DKIM", "verified"],
      ["DMARC", "verified"],
    ]);
  });
  it("reports missing records and an unset DKIM selector", async () => {
    const r = await checkSendingDomain({ fromAddress: "noreply@example.com" }, fake({}));
    expect(r.checks.map((c) => c.status)).toEqual(["missing", "not_configured", "missing"]);
  });
});

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("M11 email pipeline (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const sent: { to: string; subject: string; headers?: Record<string, string> }[] = [];
  let failNext: unknown = null;
  const ctx = (over: Partial<EmailProcessContext> = {}): EmailProcessContext => ({
    send: async (m) => {
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
      sent.push({ to: m.to, subject: m.subject, headers: m.headers });
      return { messageId: `<${randomUUID()}@test>` };
    },
    appUrl: "https://app.test",
    launchCouponCode: "EARLYBIRD",
    isFinalAttempt: false,
    ...over,
  });
  const T = (job: TransactionalEmailJob, c = ctx()) => processTransactionalEmail(db, job, c);
  const M = (job: MarketingEmailJob, c = ctx()) => processMarketingEmail(db, job, c);

  async function newUser(opts: { consent?: boolean; firstName?: string } = {}) {
    const email = `m11-${randomUUID()}@example.com`;
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email, firstName: opts.firstName ?? "Asha" });
    userIds.push(userId);
    if (opts.consent) await setEmailPreferences(db, { userId, source: "settings", reminders: true, productUpdates: true });
    return { userId, email };
  }
  const messages = (userId: string) => db.select().from(emailMessages).where(eq(emailMessages.userId, userId));

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });
  beforeEach(() => {
    sent.length = 0;
    failNext = null;
  });
  afterAll(async () => {
    const camps = await db.select({ id: emailCampaigns.id }).from(emailCampaigns).where(like(emailCampaigns.subject, "M11TEST%"));
    if (camps.length) {
      await db.delete(emailMessages).where(inArray(emailMessages.campaignId, camps.map((c) => c.id)));
      await db.delete(emailCampaigns).where(inArray(emailCampaigns.id, camps.map((c) => c.id)));
    }
    const emails = (await db.select({ e: users.email }).from(users).where(inArray(users.id, userIds))).map((r) => r.e);
    if (emails.length) await db.delete(emailSuppressions).where(inArray(emailSuppressions.email, emails));
    await db.delete(auditLogs).where(inArray(auditLogs.adminUserId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  // ─── Transactional (16.2.16) ────────────────────────────────────────────

  async function redeemCoupon(userId: string) {
    const [c] = await db.insert(coupons).values({ code: `M11${randomUUID().slice(0, 8).toUpperCase()}`, credits: 500 }).returning();
    const [r] = await db.insert(codeRedemptions).values({ userId, codeType: "coupon", couponId: c!.id, creditsToUser: 500, creditsToReferrer: 0 }).returning();
    await grantCredits(db, { userId, type: "coupon_credit", credits: 500, sourceType: "code_redemption", sourceId: r!.id });
    return { redemptionId: r!.id, code: c!.code, couponId: c!.id };
  }

  it("code_applied sends once under duplicate and concurrent jobs, with the ledger's balance", async () => {
    const { userId, email } = await newUser();
    const { redemptionId, couponId } = await redeemCoupon(userId);
    const job = { templateKey: "code_applied" as const, userId, redemptionId };
    const results = await Promise.all([T(job), T(job), T(job)]);
    expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(await T(job)).toEqual({ status: "already_sent" });
    expect(sent).toEqual([expect.objectContaining({ to: email, subject: "500 credits added to your wallet" })]);
    const [m] = await messages(userId);
    expect(m?.mergeData).toMatchObject({ credits: 500, balance: 500 });
    await db.delete(codeRedemptions).where(eq(codeRedemptions.id, redemptionId));
    await db.delete(coupons).where(eq(coupons.id, couponId));
  });

  it("recharge_pending only if still pending; recharge_failed only if still failed; both reach suspended users", async () => {
    const { userId } = await newUser();
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, userId));
    const [p] = await db.insert(payments).values({ userId, orderId: `order_${randomUUID().slice(0, 12)}`, amountPaise: 50_000, credits: 10_000 }).returning();
    expect((await T({ templateKey: "recharge_pending", userId, paymentId: p!.id })).status).toBe("sent");

    await db.update(payments).set({ status: "failed", failureReason: "Bank declined" }).where(eq(payments.id, p!.id));
    expect((await T({ templateKey: "recharge_failed", userId, paymentId: p!.id })).status).toBe("sent");
    expect(await T({ templateKey: "recharge_failed", userId, paymentId: p!.id })).toEqual({ status: "already_sent" });
    expect(sent.map((s) => s.subject)).toEqual(["We're confirming your ₹500 payment", expect.stringMatching(/₹500/)]);

    const [q] = await db.insert(payments).values({ userId, orderId: `order_${randomUUID().slice(0, 12)}`, amountPaise: 50_000, credits: 10_000, status: "captured" }).returning();
    expect(await T({ templateKey: "recharge_pending", userId, paymentId: q!.id })).toMatchObject({ status: "skipped", reason: "payment already captured" });
  });

  it("the outbox sweep finds ledger rows and stale orders with no email yet, and nothing already sent", async () => {
    const { userId } = await newUser();
    const { redemptionId } = await redeemCoupon(userId);
    const old = new Date(Date.now() - 15 * 60_000);
    const [p] = await db.insert(payments).values({ userId, orderId: `order_${randomUUID().slice(0, 12)}`, amountPaise: 50_000, credits: 10_000, createdAt: old }).returning();
    const mine = (jobs: TransactionalEmailJob[]) => jobs.filter((j) => j.userId === userId);

    expect(mine(await findMissingTransactionalEmails(db))).toEqual(
      expect.arrayContaining([
        { templateKey: "code_applied", userId, redemptionId },
        { templateKey: "recharge_pending", userId, paymentId: p!.id },
      ]),
    );
    await T({ templateKey: "code_applied", userId, redemptionId });
    await T({ templateKey: "recharge_pending", userId, paymentId: p!.id });
    expect(mine(await findMissingTransactionalEmails(db))).toEqual([]);
  });

  it("a 550 rejection fails and suppresses the address; a 421 retries, then sends", async () => {
    const a = await newUser();
    const { redemptionId: r1 } = await redeemCoupon(a.userId);
    failNext = Object.assign(new Error("550 no such user"), { responseCode: 550, command: "RCPT TO" });
    expect((await T({ templateKey: "code_applied", userId: a.userId, redemptionId: r1 })).status).toBe("failed_permanent");
    expect(await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, a.email))).toHaveLength(1);

    const b = await newUser();
    const { redemptionId: r2 } = await redeemCoupon(b.userId);
    failNext = Object.assign(new Error("421 try later"), { responseCode: 421, command: "DATA" });
    await expect(T({ templateKey: "code_applied", userId: b.userId, redemptionId: r2 })).rejects.toThrow(/421/);
    expect((await T({ templateKey: "code_applied", userId: b.userId, redemptionId: r2 })).status).toBe("sent");
  });

  // ─── Marketing consent / unsubscribe (16.2.18) ──────────────────────────

  it("marketing never goes without consent, to suppressed or suspended users; complaints don't block receipts", async () => {
    const noConsent = await newUser();
    const job = (userId: string, campaignId: string): MarketingEmailJob => ({ templateKey: "new_features", userId, campaignId });
    const [c] = await db
      .insert(emailCampaigns)
      .values({ templateKey: "new_features", audienceFilters: {}, subject: "M11TEST hi {first_name}", content: { headline: "New things", features: [{ title: "Alpha", body: "B b", ctaLabel: "Go", ctaUrl: "https://app.test/x" }] }, status: "sending", createdBy: noConsent.userId })
      .returning();
    expect(await M(job(noConsent.userId, c!.id))).toMatchObject({ status: "skipped", reason: "no consent for product updates" });

    const ok = await newUser({ consent: true });
    expect((await M(job(ok.userId, c!.id))).status).toBe("sent");
    expect(sent[0]).toMatchObject({ to: ok.email, subject: "M11TEST hi Asha" });
    expect(sent[0]?.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/app\.test\/api\/email\/unsubscribe\?t=/);
    expect(sent[0]?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const complained = await newUser({ consent: true });
    await db.insert(emailSuppressions).values({ email: complained.email, reason: "complaint" });
    expect((await M(job(complained.userId, c!.id))).status).toBe("skipped");
    const { redemptionId } = await redeemCoupon(complained.userId);
    expect((await T({ templateKey: "code_applied", userId: complained.userId, redemptionId })).status).toBe("sent");

    const suspended = await newUser({ consent: true });
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, suspended.userId));
    expect(await M(job(suspended.userId, c!.id))).toMatchObject({ status: "skipped", reason: "user suspended" });
  });

  it("one-click unsubscribe takes effect for the rest of a campaign already sending", async () => {
    const admin = await newUser();
    const [adminRow] = await db.select({ at: users.createdAt }).from(users).where(eq(users.id, admin.userId));
    const a = await newUser({ consent: true });
    const b = await newUser({ consent: true });
    const queued: MarketingEmailJob[] = [];
    const res = await createCampaign(
      db,
      { adminUserId: admin.userId, subject: "M11TEST mid-send", content: { headline: "News", features: [{ title: "Alpha", body: "Body", ctaLabel: "Go", ctaUrl: "https://app.test/x" }] }, filters: { joinedAfter: adminRow!.at }, scheduledAt: null },
      async (jobs) => queued.push(...jobs),
    );
    const mine = queued.filter((j) => j.userId === a.userId || j.userId === b.userId);
    expect(mine).toHaveLength(2);

    expect((await M(mine.find((j) => j.userId === a.userId)!)).status).toBe("sent");
    // b clicks unsubscribe in another email before their send runs.
    expect(await applyUnsubscribe(db, signUnsubscribeToken(b.userId, "productUpdates"))).toMatchObject({ scope: "productUpdates" });
    expect(await M(mine.find((j) => j.userId === b.userId)!)).toMatchObject({ status: "skipped" });
    expect((await getEmailPreferences(db, b.userId)).productUpdates).toBe(false);

    await dispatchDueCampaigns(db, async () => undefined);
    const [camp] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, res.campaignId));
    expect(camp?.status === "sent" || camp?.status === "sending").toBe(true);
    expect(camp?.sentCount).toBeGreaterThanOrEqual(1);
  });

  it("audience counts apply exclusions; scheduled campaigns start on time and can be cancelled before", async () => {
    const admin = await newUser();
    // DB clock, just after the admin's row, so users from earlier tests don't count.
    const [adminRow] = await db.select({ at: users.createdAt }).from(users).where(eq(users.id, admin.userId));
    const since = new Date(adminRow!.at.getTime() + 1);
    await new Promise((r) => setTimeout(r, 5));
    await newUser({ consent: true });
    await newUser({ consent: true });
    await newUser(); // no consent → excluded
    const count = await countAudience(db, { joinedAfter: since });
    expect(count).toEqual({ recipients: 2, excluded: 1 });

    const base = { adminUserId: admin.userId, content: { headline: "News", features: [{ title: "Alpha", body: "Body", ctaLabel: "Go", ctaUrl: "https://app.test/x" }] }, filters: { joinedAfter: since } };
    const queued: MarketingEmailJob[] = [];
    const enqueue = async (jobs: MarketingEmailJob[]) => queued.push(...jobs);
    const later = await createCampaign(db, { ...base, subject: "M11TEST later", scheduledAt: new Date(Date.now() + 3_600_000) }, enqueue);
    const soon = await createCampaign(db, { ...base, subject: "M11TEST soon", scheduledAt: new Date(Date.now() + 30_000) }, enqueue);
    await cancelCampaign(db, { adminUserId: admin.userId, campaignId: later.campaignId, reason: "changed mind" });

    await dispatchDueCampaigns(db, enqueue, new Date(Date.now() + 60_000));
    expect(queued.filter((j) => j.templateKey === "new_features" && j.campaignId === soon.campaignId)).toHaveLength(2);
    expect(queued.some((j) => j.templateKey === "new_features" && j.campaignId === later.campaignId)).toBe(false);
    await expect(cancelCampaign(db, { adminUserId: admin.userId, campaignId: soon.campaignId, reason: "too late" })).rejects.toThrow(/hasn't started/);
  });

  it("an admin-disabled marketing template stops sends", async () => {
    const u = await newUser({ consent: true });
    await db.insert(emailTemplateSettings).values({ templateKey: "new_features", enabled: false }).onConflictDoUpdate({ target: emailTemplateSettings.templateKey, set: { enabled: false } });
    const [c] = await db
      .insert(emailCampaigns)
      .values({ templateKey: "new_features", audienceFilters: {}, subject: "M11TEST off", content: { headline: "x x x", features: [{ title: "Alpha", body: "B b", ctaLabel: "Go", ctaUrl: "https://app.test/x" }] }, status: "sending", createdBy: u.userId })
      .returning();
    expect(await M({ templateKey: "new_features", userId: u.userId, campaignId: c!.id })).toMatchObject({ status: "skipped", reason: "template switched off by admin" });
    // Leave the seeded row as it was: on.
    await db.update(emailTemplateSettings).set({ enabled: true }).where(eq(emailTemplateSettings.templateKey, "new_features"));
  });

  // ─── Inactive nudge ─────────────────────────────────────────────────────

  it("nudges after 30 days away, at most 3 per absence; signing in resets; zero-balance never-paid users get only the first", async () => {
    const DAY = 86_400_000;
    const now = new Date();
    const away = await newUser({ consent: true });
    await db.update(users).set({ lastActiveAt: new Date(now.getTime() - 31 * DAY) }).where(eq(users.id, away.userId));
    await db.update(creditAccounts).set({ balance: 0 }).where(eq(creditAccounts.userId, away.userId));
    await grantCredits(db, { userId: away.userId, type: "coupon_credit", credits: 200, sourceType: "code_redemption", sourceId: randomUUID() });

    const jobsFor = async (userId: string, at = now) => (await findInactiveNudges(db, at)).filter((j) => j.userId === userId);
    const [n1] = await jobsFor(away.userId);
    expect(n1).toMatchObject({ templateKey: "inactive_nudge", nudge: 1 });
    expect((await M(n1!)).status).toBe("sent");
    expect(sent.at(-1)?.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(await jobsFor(away.userId)).toEqual([]); // already sent nudge 1

    expect((await jobsFor(away.userId, new Date(now.getTime() + 400 * DAY)))[0]).toMatchObject({ nudge: 3 }); // capped

    await db.update(users).set({ lastActiveAt: new Date(now.getTime() - 2 * 3_600_000) }).where(eq(users.id, away.userId));
    await touchUserActivity(db, away.userId, null, now);
    expect(await jobsFor(away.userId)).toEqual([]);
    expect((await M(n1!)).status).not.toBe("sent"); // stale job from the old absence

    const broke = await newUser({ consent: true });
    await db.update(users).set({ lastActiveAt: new Date(now.getTime() - 61 * DAY) }).where(eq(users.id, broke.userId));
    expect(await jobsFor(broke.userId)).toEqual([]); // nudge 2, balance 0, never topped up
    await db.update(users).set({ lastActiveAt: new Date(now.getTime() - 31 * DAY) }).where(eq(users.id, broke.userId));
    expect(await jobsFor(broke.userId)).toHaveLength(1); // the first one still goes
  });

  it("consent is recorded with its source; turning a category on lifts an unsubscribe-all", async () => {
    const u = await newUser();
    await db.insert(emailSuppressions).values({ email: u.email, reason: "unsubscribe_all" });
    const p = await setEmailPreferences(db, { userId: u.userId, source: "signup", reminders: true });
    expect(p).toMatchObject({ reminders: true, productUpdates: false, consentSource: "signup" });
    expect(await db.select().from(emailSuppressions).where(and(eq(emailSuppressions.email, u.email)))).toHaveLength(0);
    const [row] = await db.select().from(emailPreferences).where(eq(emailPreferences.userId, u.userId));
    expect(row?.consentAt).toBeInstanceOf(Date);
  });
});
