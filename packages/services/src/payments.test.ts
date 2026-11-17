import { createHmac, randomUUID } from "node:crypto";
import { auditLogs, createDatabase, creditAccounts, creditHolds, creditLedger, creditPackages, emailMessages, paymentEvents, payments, refunds, users, aiJobs, type Database } from "@resume-pilot/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processTransactionalEmail } from "./email";
import { grantCredits } from "./ledger";
import { listActiveCreditPackages } from "./account";
import {
  adminCreateCreditPackage,
  adminUpdateCreditPackage,
  confirmCheckout,
  createTopUpOrder,
  handleRazorpayWebhook,
  proRataRefundPaise,
  quoteRefund,
  refundDeadline,
  refundPayment,
  retryRefund,
  type RazorpayWebhookEvent,
} from "./payments";
import { verifyCheckoutSignature, verifyWebhookSignature, type RazorpayClient, type RazorpayPayment, type RazorpayRefund } from "./razorpay";
import { createUserFromClerkWebhook } from "./user";

describe("pro-rata refund math (§11.2)", () => {
  it("worked example: ₹1,000 pack of 21,000 credits, 7,000 used → ₹666.66", () => {
    // 14,000 × 100,000 paise ÷ 21,000 = 66,666.67 → rounded down
    expect(proRataRefundPaise(14_000, 100_000, 21_000)).toBe(66_666);
  });
  it("no bonus: ₹500 for 10,000, 2,500 unused → ₹125", () => {
    expect(proRataRefundPaise(2_500, 50_000, 10_000)).toBe(12_500);
  });
  it("never exceeds the amount paid, and zero for nothing unused", () => {
    expect(proRataRefundPaise(21_000, 100_000, 21_000)).toBe(100_000);
    expect(proRataRefundPaise(99_999, 100_000, 21_000)).toBe(100_000);
    expect(proRataRefundPaise(0, 100_000, 21_000)).toBe(0);
  });
  it("window is 6 calendar months from capture", () => {
    expect(refundDeadline(new Date("2026-01-15T10:00:00Z")).toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });
});

describe("Razorpay signatures", () => {
  const secret = randomUUID();
  it("checkout: HMAC(order_id|payment_id, key secret)", () => {
    const signature = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature(secret, { orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(verifyCheckoutSignature(secret, { orderId: "order_2", paymentId: "pay_1", signature })).toBe(false);
    expect(verifyCheckoutSignature(secret, { orderId: "order_1", paymentId: "pay_1", signature: "zz" })).toBe(false);
  });
  it("webhook: HMAC(raw body, webhook secret)", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(secret, body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, `${body} `, sig)).toBe(false);
  });
});

const connectionString = process.env.DATABASE_URL;

/** In-memory Razorpay: orders, payments and refunds. `failRefund` simulates an API outage. */
function fakeRazorpay() {
  const orders = new Map<string, { amount: number }>();
  const pays = new Map<string, RazorpayPayment>();
  const refundsMade: RazorpayRefund[] = [];
  const rz: RazorpayClient & { pay: (orderId: string, opts?: { amount?: number; status?: string }) => RazorpayPayment; refundsMade: RazorpayRefund[]; failRefund: boolean; loseResponse: boolean } = {
    keyId: "rzp_test_fake",
    refundsMade,
    failRefund: false,
    loseResponse: false,
    async createOrder({ amountPaise }) {
      const id = `order_${randomUUID().slice(0, 14)}`;
      orders.set(id, { amount: amountPaise });
      return { id, amount: amountPaise, currency: "INR", status: "created" };
    },
    pay(orderId, opts = {}) {
      const p: RazorpayPayment = { id: `pay_${randomUUID().slice(0, 14)}`, order_id: orderId, amount: opts.amount ?? orders.get(orderId)!.amount, currency: "INR", status: opts.status ?? "captured", method: "upi" };
      pays.set(p.id, p);
      return p;
    },
    async fetchPayment(id) {
      const p = pays.get(id);
      if (!p) throw new Error("no such payment");
      return p;
    },
    async refund({ paymentId, amountPaise, notes }) {
      if (rz.failRefund) throw new Error("Razorpay is down");
      const r: RazorpayRefund = { id: `rfnd_${randomUUID().slice(0, 14)}`, payment_id: paymentId, amount: amountPaise, status: "processed", notes };
      refundsMade.push(r);
      if (rz.loseResponse) throw new Error("socket hang up");
      return r;
    },
    async listRefunds(paymentId) {
      return refundsMade.filter((r) => r.payment_id === paymentId);
    },
  };
  return rz;
}

const capturedEvent = (p: RazorpayPayment): RazorpayWebhookEvent => ({ event: "payment.captured", payload: { payment: { entity: p } } });

describe.skipIf(!connectionString)("payments + refunds (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const adminId = { id: "" };
  let pack500: string;
  let pack1000: string;

  const newUser = async () => {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `pay-${randomUUID()}@example.com` });
    userIds.push(userId);
    return userId;
  };
  const balance = async (userId: string) => (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)))[0]!.balance;
  const purchases = (userId: string) => db.select().from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "purchase")));
  const payRow = async (orderId: string) => (await db.select().from(payments).where(eq(payments.orderId, orderId)))[0]!;

  /** Order → checkout → captured payment, without granting. */
  async function checkout(userId: string, packageId: string, rz = fakeRazorpay()) {
    const order = await createTopUpOrder(db, { userId, packageId }, rz);
    return { order, p: rz.pay(order.orderId), rz };
  }
  /** Full top-up granted through the client confirm. */
  async function topUp(userId: string, packageId: string, rz = fakeRazorpay()) {
    const c = await checkout(userId, packageId, rz);
    await confirmCheckout(db, { userId, orderId: c.order.orderId, paymentId: c.p.id, signatureValid: true }, rz);
    return { ...c, row: await payRow(c.order.orderId) };
  }

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    // The seeded packs (prd.md §2): ₹500 = 10,000; ₹1,000 = 20,000 + 1,000 bonus.
    await db
      .insert(creditPackages)
      .values([
        { pricePaise: 50_000, credits: 10_000, bonusCredits: 0, sortOrder: 0 },
        { pricePaise: 100_000, credits: 20_000, bonusCredits: 1_000, sortOrder: 1 },
      ])
      .onConflictDoNothing();
    const packs = await db.select().from(creditPackages).where(inArray(creditPackages.pricePaise, [50_000, 100_000]));
    pack500 = packs.find((p) => p.pricePaise === 50_000)!.id;
    pack1000 = packs.find((p) => p.pricePaise === 100_000)!.id;
    await db.update(creditPackages).set({ active: true, credits: 10_000, bonusCredits: 0 }).where(eq(creditPackages.id, pack500));
    await db.update(creditPackages).set({ active: true, credits: 20_000, bonusCredits: 1_000 }).where(eq(creditPackages.id, pack1000));
    adminId.id = await newUser();
  });
  afterAll(async () => {
    const pays = await db.select({ id: payments.id }).from(payments).where(inArray(payments.userId, userIds));
    if (pays.length) {
      await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pays.map((p) => p.id)));
      await db.delete(refunds).where(inArray(refunds.paymentId, pays.map((p) => p.id)));
    }
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminId.id));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  // ─── Acceptance 16.2.13 ─────────────────────────────────────────────────

  it("₹500 grants exactly 10,000 credits, even with a duplicate webhook after the client confirm", async () => {
    const userId = await newUser();
    const { order, p, rz } = await checkout(userId, pack500);
    expect(order).toMatchObject({ amountPaise: 50_000, credits: 10_000 });

    const first = await confirmCheckout(db, { userId, orderId: order.orderId, paymentId: p.id, signatureValid: true }, rz);
    expect(first.granted).toBe(true);
    const eventId = `evt_${randomUUID()}`;
    const w1 = await handleRazorpayWebhook(db, { eventId, event: capturedEvent(p) });
    const w2 = await handleRazorpayWebhook(db, { eventId, event: capturedEvent(p) });
    expect(w1).toMatchObject({ handled: "already_granted", duplicate: false });
    expect(w2).toMatchObject({ handled: "already_granted", duplicate: true });

    expect(await balance(userId)).toBe(10_000);
    expect(await purchases(userId)).toHaveLength(1);
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.eventId, eventId))).toHaveLength(1);
    expect(await payRow(order.orderId)).toMatchObject({ status: "captured", paymentId: p.id, method: "upi" });
  });

  it("₹1,000 grants exactly 21,000 credits when webhooks race each other and the client confirm", async () => {
    const userId = await newUser();
    const { order, p, rz } = await checkout(userId, pack1000);
    const results = await Promise.all([
      handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: capturedEvent(p) }),
      handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: { event: "order.paid", payload: { payment: { entity: p } } } }),
      confirmCheckout(db, { userId, orderId: order.orderId, paymentId: p.id, signatureValid: true }, rz),
      handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: capturedEvent(p) }),
    ]);
    const grants = results.map((r) => ("handled" in r ? r.handled === "granted" : r.granted)).filter(Boolean);
    expect(grants).toHaveLength(1);
    expect(await balance(userId)).toBe(21_000);
    expect(await purchases(userId)).toHaveLength(1);
  });

  // ─── Safety checks ──────────────────────────────────────────────────────

  it("rejects a bad signature, someone else's order, and a payment for the wrong amount", async () => {
    const userId = await newUser();
    const other = await newUser();
    const { order, p, rz } = await checkout(userId, pack500);
    await expect(confirmCheckout(db, { userId, orderId: order.orderId, paymentId: p.id, signatureValid: false }, rz)).rejects.toThrow(/signature/);
    await expect(confirmCheckout(db, { userId: other, orderId: order.orderId, paymentId: p.id, signatureValid: true }, rz)).rejects.toThrow(/not found/);

    const short = rz.pay(order.orderId, { amount: 100 });
    await expect(handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: capturedEvent(short) })).rejects.toThrow(/doesn't match/);
    expect(await balance(userId)).toBe(0);
  });

  it("authorized-but-not-captured waits for the webhook; a failure then a retry on the same order still grants once", async () => {
    const userId = await newUser();
    const { order, rz } = await checkout(userId, pack500);
    const authorized = rz.pay(order.orderId, { status: "authorized" });
    expect((await confirmCheckout(db, { userId, orderId: order.orderId, paymentId: authorized.id, signatureValid: true }, rz)).granted).toBe(false);

    await handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: { event: "payment.failed", payload: { payment: { entity: { ...authorized, status: "failed", error_description: "Bank declined" } } } } });
    expect(await payRow(order.orderId)).toMatchObject({ status: "failed", failureReason: "Bank declined" });

    const retry = rz.pay(order.orderId);
    await handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: capturedEvent(retry) });
    expect(await payRow(order.orderId)).toMatchObject({ status: "captured", paymentId: retry.id });
    expect(await balance(userId)).toBe(10_000);
  });

  it("price and credits come from the pack row; a disabled pack can't be bought", async () => {
    const userId = await newUser();
    const pack = await adminCreateCreditPackage(db, { adminUserId: adminId.id, pricePaise: 100 * (2000 + Math.floor(Math.random() * 3000)), credits: 40_000, bonusCredits: 2_000, sortOrder: 9, reason: "test pack" });
    try {
      expect((await listActiveCreditPackages(db)).some((p) => p.id === pack.id)).toBe(true);
      const { order } = await checkout(userId, pack.id);
      expect(order.credits).toBe(42_000);

      await adminUpdateCreditPackage(db, { adminUserId: adminId.id, packageId: pack.id, active: false, reason: "test disable" });
      expect((await listActiveCreditPackages(db)).some((p) => p.id === pack.id)).toBe(false);
      await expect(createTopUpOrder(db, { userId, packageId: pack.id }, fakeRazorpay())).rejects.toThrow(/isn't available/);
      // An order created before the change keeps its credits.
      expect((await payRow(order.orderId)).credits).toBe(42_000);
      expect(await db.select().from(auditLogs).where(and(eq(auditLogs.targetId, pack.id), eq(auditLogs.action, "credit_package.toggle")))).toHaveLength(1);
    } finally {
      await db.delete(payments).where(eq(payments.packageId, pack.id));
      await db.delete(creditPackages).where(eq(creditPackages.id, pack.id));
    }
  });

  it("sends the recharge_success receipt once per payment, with the balance from the purchase row", async () => {
    const userId = await newUser();
    const { row } = await topUp(userId, pack500);
    const sent: string[] = [];
    const ctx = { send: async (m: { subject: string }) => (sent.push(m.subject), { messageId: randomUUID() }), appUrl: "https://app.test", launchCouponCode: "X", isFinalAttempt: false };
    const job = { templateKey: "recharge_success" as const, userId, paymentId: row.id };
    expect((await processTransactionalEmail(db, job, ctx)).status).toBe("sent");
    expect((await processTransactionalEmail(db, job, ctx)).status).toBe("already_sent");
    expect(sent).toEqual(["Payment received: 10,000 credits added"]);
    const [msg] = await db.select().from(emailMessages).where(eq(emailMessages.idempotencyKey, `recharge_success:${row.id}`));
    expect(msg?.mergeData).toMatchObject({ new_balance: 10_000, credits: 10_000, payment_id: row.paymentId, method: "UPI" });
  });

  // ─── Refunds (§11.2) ────────────────────────────────────────────────────

  it("refunds unused purchased credits pro rata: debits the ledger first, then Razorpay", async () => {
    const userId = await newUser();
    const { row, rz } = await topUp(userId, pack1000);
    // Spend 7,000 of the 21,000 (an admin debit stands in for AI captures).
    await db.transaction(async (tx) => {
      const { postLedgerEntry } = await import("./ledger");
      await postLedgerEntry(tx, { userId, type: "admin_adjustment", credits: -7_000, sourceType: "admin_adjustment", sourceId: randomUUID(), note: "usage" });
    });

    const q = await quoteRefund(db, row.id);
    expect(q).toMatchObject({ refundableCredits: 14_000, refundablePaise: 66_666, blockedReason: null });

    const r = await refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, reason: "customer asked" }, rz);
    expect(r).toMatchObject({ credits: 14_000, amountPaise: 66_666, status: "processed" });
    expect(await balance(userId)).toBe(0);
    expect(rz.refundsMade).toEqual([expect.objectContaining({ payment_id: row.paymentId, amount: 66_666 })]);
    expect(await payRow(row.orderId)).toMatchObject({ status: "refunded" });
    const [debit] = await db.select().from(creditLedger).where(and(eq(creditLedger.userId, userId), eq(creditLedger.type, "refund")));
    expect(debit).toMatchObject({ credits: -14_000, sourceType: "refund", sourceId: r.refundId });

    await expect(refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, reason: "again" }, rz)).rejects.toThrow(/already been refunded/);
  });

  it("blocks refunds past 6 months, and of coupon/referral credits", async () => {
    const userId = await newUser();
    const { row, rz } = await topUp(userId, pack500);
    const later = new Date(row.capturedAt!.getTime() + 190 * 86_400_000);
    await expect(refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, reason: "late" }, rz, later)).rejects.toThrow(/within 6 months/);

    // 10,000 bought and all spent, then a 500 coupon: the 500 left are coupon credits, never refundable.
    await db.transaction(async (tx) => {
      const { postLedgerEntry } = await import("./ledger");
      await postLedgerEntry(tx, { userId, type: "admin_adjustment", credits: -10_000, sourceType: "admin_adjustment", sourceId: randomUUID(), note: "usage" });
    });
    await grantCredits(db, { userId, type: "coupon_credit", credits: 500, sourceType: "code_redemption", sourceId: randomUUID() });
    expect(await balance(userId)).toBe(500);
    const q = await quoteRefund(db, row.id);
    expect(q.refundableCredits).toBe(0);
    expect(q.blockedReason).toMatch(/never refunded/);
    await expect(refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, reason: "coupon" }, rz)).rejects.toThrow(/never refunded/);
    expect(rz.refundsMade).toHaveLength(0);
  });

  it("gift credits are spent first, and credits held by a running job aren't refundable", async () => {
    const userId = await newUser();
    await grantCredits(db, { userId, type: "referral_credit", credits: 1_000, sourceType: "code_redemption", sourceId: randomUUID() });
    const { row } = await topUp(userId, pack500);
    // 1,500 spent: the 1,000 gift first, then 500 purchased.
    await db.transaction(async (tx) => {
      const { postLedgerEntry } = await import("./ledger");
      await postLedgerEntry(tx, { userId, type: "admin_adjustment", credits: -1_500, sourceType: "admin_adjustment", sourceId: randomUUID(), note: "usage" });
    });
    expect((await quoteRefund(db, row.id)).refundableCredits).toBe(9_500);

    const [job] = await db.insert(aiJobs).values({ userId, type: "generation", status: "running", input: {}, creditsEstimated: 2_000, idempotencyKey: randomUUID(), pricingConfigVersion: sql`(select max(version) from pricing_config)` as never }).returning();
    await db.insert(creditHolds).values({ userId, aiJobId: job!.id, amount: 2_000, expiresAt: new Date(Date.now() + 600_000) });
    expect((await quoteRefund(db, row.id)).refundableCredits).toBe(7_500);
    await expect(refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, credits: 8_000, reason: "too many" }, fakeRazorpay())).rejects.toThrow(/Only 7500/);
  });

  it("a Razorpay outage leaves the refund pending (credits already debited); retry finishes it without refunding twice", async () => {
    const userId = await newUser();
    const { row, rz } = await topUp(userId, pack500);
    rz.failRefund = true;
    const r = await refundPayment(db, { adminUserId: adminId.id, paymentRowId: row.id, credits: 4_000, reason: "outage" }, rz);
    expect(r.status).toBe("pending");
    expect(await balance(userId)).toBe(6_000); // debited before Razorpay
    expect((await db.select().from(refunds).where(eq(refunds.id, r.refundId)))[0]?.error).toMatch(/down/);

    // Next attempt reaches Razorpay but the response is lost …
    rz.failRefund = false;
    rz.loseResponse = true;
    expect((await retryRefund(db, { refundId: r.refundId }, rz)).status).toBe("pending");
    // … so the following retry finds that refund instead of making another.
    rz.loseResponse = false;
    expect((await retryRefund(db, { refundId: r.refundId }, rz)).status).toBe("processed");
    expect(rz.refundsMade).toHaveLength(1);
    expect(rz.refundsMade[0]?.amount).toBe(20_000); // 4,000 × 50,000 ÷ 10,000

    await handleRazorpayWebhook(db, { eventId: `evt_${randomUUID()}`, event: { event: "refund.processed", payload: { refund: { entity: { id: rz.refundsMade[0]!.id, payment_id: row.paymentId!, status: "processed" } } } } });
    expect((await db.select().from(refunds).where(eq(refunds.id, r.refundId)))[0]?.status).toBe("processed");
  });
});
