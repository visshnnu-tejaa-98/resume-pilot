import { auditLogs, creditAccounts, creditHolds, creditLedger, creditPackages, paymentEvents, payments, refunds, type Database } from "@resume-pilot/database";
import { and, eq, inArray, sql } from "drizzle-orm";
import { postLedgerEntry } from "./ledger";
import type { RazorpayClient, RazorpayPayment } from "./razorpay";

/**
 * Wallet top-ups and refunds — prd.md §11.
 *
 * Top-up: createTopUpOrder → Razorpay Checkout → confirmCheckout (client,
 * signature-verified) and/or the `payment.captured` webhook. Whichever
 * lands first grants; `grantPayment` locks the payment row and posts the
 * ledger entry keyed on it, and payments.payment_id is unique, so the
 * credits are added exactly once however many confirmations arrive.
 *
 * Refund (admin): unused purchased credits only, within 6 months, pro
 * rata for bonus packs. The ledger debit is committed before Razorpay is
 * asked to send the money.
 */

export const REFUND_WINDOW_MONTHS = 6;

export class PaymentError extends Error {
  constructor(
    readonly code: "not_found" | "pack_unavailable" | "bad_signature" | "mismatch" | "not_configured",
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export class RefundError extends Error {
  constructor(
    readonly code: "not_found" | "not_captured" | "already_refunded" | "window_expired" | "nothing_refundable" | "too_many_credits",
    message: string,
  ) {
    super(message);
    this.name = "RefundError";
  }
}

// ─── Top-up ────────────────────────────────────────────────────────────────

export interface TopUpOrder {
  keyId: string;
  orderId: string;
  amountPaise: number;
  credits: number;
  currency: "INR";
}

/** Step 1–2 of §11.1: price and credits come from the pack row, never from the client. */
export async function createTopUpOrder(db: Database, input: { userId: string; packageId: string }, razorpay: RazorpayClient): Promise<TopUpOrder> {
  const [pack] = await db
    .select()
    .from(creditPackages)
    .where(and(eq(creditPackages.id, input.packageId), eq(creditPackages.active, true)));
  if (!pack) throw new PaymentError("pack_unavailable", "That top-up pack isn't available any more");

  const credits = pack.credits + pack.bonusCredits;
  const order = await razorpay.createOrder({
    amountPaise: pack.pricePaise,
    // Razorpay caps receipt at 40 chars.
    receipt: `topup_${Date.now().toString(36)}_${input.userId.slice(0, 8)}`,
    notes: { packageId: pack.id, userId: input.userId },
  });
  if (order.amount !== pack.pricePaise) throw new PaymentError("mismatch", "Razorpay created the order for a different amount");

  await db.insert(payments).values({ userId: input.userId, packageId: pack.id, orderId: order.id, amountPaise: pack.pricePaise, credits });
  return { keyId: razorpay.keyId, orderId: order.id, amountPaise: pack.pricePaise, credits, currency: "INR" };
}

export interface GrantResult {
  /** The payments row. */
  id: string;
  userId: string;
  /** True only for the call that actually added the credits. */
  granted: boolean;
  status: "captured" | "refunded" | "failed" | "created";
}

/**
 * Credits a captured payment exactly once (§11.1 step 6). Safe to call
 * from the client confirm and every webhook delivery, concurrently.
 * Checks the captured amount and order against our row, so a payment
 * for one order can never unlock another.
 */
export async function grantPayment(db: Database, p: Pick<RazorpayPayment, "id" | "order_id" | "amount" | "currency" | "method">, now = new Date()): Promise<GrantResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(payments).where(eq(payments.orderId, p.order_id)).for("update");
    if (!row) throw new PaymentError("not_found", `No payment for order ${p.order_id}`);
    if (row.paymentId && row.paymentId !== p.id) {
      // A second successful payment on the same order: never grant twice for one order. Razorpay auto-refunds these.
      throw new PaymentError("mismatch", `Order ${p.order_id} is already paid by ${row.paymentId}`);
    }
    if (p.amount !== row.amountPaise || p.currency !== "INR") {
      throw new PaymentError("mismatch", `Payment ${p.id} amount ${p.amount} ${p.currency} doesn't match order ${row.amountPaise} INR`);
    }
    if (row.status === "captured" || row.status === "refunded") return { id: row.id, userId: row.userId, granted: false, status: row.status };

    await tx
      .update(payments)
      .set({ paymentId: p.id, status: "captured", method: p.method ?? row.method, capturedAt: now, failureReason: null, updatedAt: now })
      .where(eq(payments.id, row.id));
    const entry = await postLedgerEntry(tx, {
      userId: row.userId,
      type: "purchase",
      credits: row.credits,
      sourceType: "payment",
      sourceId: row.id,
      note: `Top-up ${p.id}`,
    });
    return { id: row.id, userId: row.userId, granted: entry.created, status: "captured" };
  });
}

/** Step 4: Checkout's success handler, signature-verified by the caller, payment fetched from Razorpay. */
export async function confirmCheckout(
  db: Database,
  input: { userId: string; orderId: string; paymentId: string; signatureValid: boolean },
  razorpay: Pick<RazorpayClient, "fetchPayment">,
): Promise<GrantResult> {
  if (!input.signatureValid) throw new PaymentError("bad_signature", "Payment signature didn't verify");
  const [row] = await db.select({ userId: payments.userId }).from(payments).where(eq(payments.orderId, input.orderId));
  if (!row || row.userId !== input.userId) throw new PaymentError("not_found", "Payment not found");

  const p = await razorpay.fetchPayment(input.paymentId);
  if (p.order_id !== input.orderId) throw new PaymentError("mismatch", "Payment belongs to a different order");
  // Authorized-but-not-captured settles via the webhook; the result page waits for it.
  if (p.status !== "captured") return { id: "", userId: row.userId, granted: false, status: "created" };
  return grantPayment(db, p);
}

/** Marks an unpaid order failed (payment.failed). A later success on the same order still grants. */
export async function markPaymentFailed(db: Database, p: Pick<RazorpayPayment, "order_id" | "error_description" | "method">) {
  await db
    .update(payments)
    .set({ status: "failed", failureReason: p.error_description?.slice(0, 500) ?? null, method: p.method ?? null, updatedAt: new Date() })
    .where(and(eq(payments.orderId, p.order_id), eq(payments.status, "created")));
}

// ─── Webhook ───────────────────────────────────────────────────────────────

export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPayment };
    refund?: { entity: { id: string; payment_id: string; status: string; notes?: Record<string, string> | [] } };
  };
}

export type WebhookOutcome = { handled: "granted" | "already_granted" | "failed_marked" | "refund_updated" | "ignored"; duplicate: boolean; grant?: GrantResult };

/**
 * Handles one verified webhook delivery (§11.3). The work is idempotent
 * on its own (grant keyed on the payment), so it runs first and the raw
 * event is stored after; a delivery that crashed mid-way is simply
 * redone by Razorpay's retry. `duplicate` says the event id was seen before.
 */
export async function handleRazorpayWebhook(db: Database, input: { eventId: string; event: RazorpayWebhookEvent }): Promise<WebhookOutcome> {
  const { event } = input;
  const payment = event.payload.payment?.entity;
  let outcome: WebhookOutcome["handled"] = "ignored";
  let grant: GrantResult | undefined;

  if ((event.event === "payment.captured" || event.event === "order.paid") && payment) {
    grant = await grantPayment(db, payment);
    outcome = grant.granted ? "granted" : "already_granted";
  } else if (event.event === "payment.failed" && payment) {
    await markPaymentFailed(db, payment);
    outcome = "failed_marked";
  } else if ((event.event === "refund.processed" || event.event === "refund.failed") && event.payload.refund) {
    const r = event.payload.refund.entity;
    await db
      .update(refunds)
      .set({ status: event.event === "refund.processed" ? "processed" : "failed", error: event.event === "refund.failed" ? "Razorpay reported the refund failed" : null, updatedAt: new Date() })
      .where(eq(refunds.razorpayRefundId, r.id));
    outcome = "refund_updated";
  }

  const [ours] = payment ? await db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, payment.order_id)) : [];
  const stored = await db
    .insert(paymentEvents)
    .values({ eventId: input.eventId, eventType: event.event, paymentId: ours?.id ?? null, payload: event })
    .onConflictDoNothing({ target: paymentEvents.eventId })
    .returning({ id: paymentEvents.id });
  return { handled: outcome, duplicate: stored.length === 0, grant };
}

// ─── Refunds (§11.2) ───────────────────────────────────────────────────────

/** 6 calendar months after capture. */
export function refundDeadline(capturedAt: Date): Date {
  const d = new Date(capturedAt);
  d.setUTCMonth(d.getUTCMonth() + REFUND_WINDOW_MONTHS);
  return d;
}

/**
 * Pro rata (§11.2): unused credits × (amount paid ÷ credits in the pack),
 * rounded down to the paisa so a refund never exceeds what was paid.
 * Worked example: ₹1,000 for 21,000 credits, 7,000 used →
 * 14,000 × 100,000 ÷ 21,000 = 66,666.67 → ₹666.66.
 */
export function proRataRefundPaise(unusedCredits: number, amountPaise: number, packCredits: number): number {
  if (unusedCredits <= 0 || packCredits <= 0) return 0;
  return Math.floor((Math.min(unusedCredits, packCredits) * amountPaise) / packCredits);
}

export interface RefundQuote {
  paymentRowId: string;
  userId: string;
  razorpayPaymentId: string;
  /** Credits from this payment still unused — the most that can be refunded. */
  refundableCredits: number;
  /** Pro-rata amount for all of them. */
  refundablePaise: number;
  packCredits: number;
  amountPaise: number;
  deadline: Date;
  /** Explains a zero. */
  blockedReason: string | null;
  blockedCode: RefundError["code"] | null;
}

/**
 * How many purchased credits in the wallet are unused.
 *
 * The wallet is one pool, so "unused purchased credits" needs a rule.
 * Walking the ledger in order, two buckets are kept: gift credits
 * (coupon, referral, positive admin adjustments — never refundable) and
 * purchased credits. Every spend takes from gifts first, the reading
 * that's fairest to the user, but only gifts that existed at that
 * moment. Refund debits come out of purchased. Credits held by a
 * running AI job are reserved the same way (gifts first) and aren't
 * refundable while held.
 */
export async function unusedPurchasedCredits(tx: Pick<Database, "select">, userId: string): Promise<number> {
  const rows = await tx
    .select({ type: creditLedger.type, credits: creditLedger.credits })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(creditLedger.createdAt, creditLedger.id);
  let gift = 0;
  let bought = 0;
  const spend = (n: number) => {
    const fromGift = Math.min(gift, n);
    gift -= fromGift;
    bought = Math.max(0, bought - (n - fromGift));
  };
  for (const r of rows) {
    if (r.type === "purchase") bought += r.credits;
    else if (r.type === "refund") bought = Math.max(0, bought + r.credits);
    else if (r.credits > 0) gift += r.credits;
    else spend(-r.credits);
  }
  const [held] = await tx
    .select({ n: sql<string>`coalesce(sum(${creditHolds.amount}), 0)` })
    .from(creditHolds)
    .where(and(eq(creditHolds.userId, userId), eq(creditHolds.status, "active")));
  spend(Number(held?.n ?? 0));
  return bought;
}

export async function quoteRefund(db: Pick<Database, "select">, paymentRowId: string, now = new Date()): Promise<RefundQuote> {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentRowId));
  if (!p) throw new RefundError("not_found", "Payment not found");
  const base = { paymentRowId: p.id, userId: p.userId, razorpayPaymentId: p.paymentId ?? "", packCredits: p.credits, amountPaise: p.amountPaise };
  const deadline = p.capturedAt ? refundDeadline(p.capturedAt) : now;
  const blocked = (blockedCode: RefundError["code"], blockedReason: string): RefundQuote => ({ ...base, deadline, refundableCredits: 0, refundablePaise: 0, blockedReason, blockedCode });

  if (p.status === "refunded") return blocked("already_refunded", "This payment has already been refunded");
  if (p.status !== "captured" || !p.capturedAt || !p.paymentId) return blocked("not_captured", "Only captured payments can be refunded");
  if (now > deadline) return blocked("window_expired", `Refunds are only possible within ${REFUND_WINDOW_MONTHS} months of purchase`);

  const unused = Math.min(p.credits, await unusedPurchasedCredits(db, p.userId));
  if (unused <= 0) return blocked("nothing_refundable", "All purchased credits have been used; coupon and referral credits are never refunded");
  return { ...base, deadline, refundableCredits: unused, refundablePaise: proRataRefundPaise(unused, p.amountPaise, p.credits), blockedReason: null, blockedCode: null };
}

export interface RefundResult {
  refundId: string;
  credits: number;
  amountPaise: number;
  status: "pending" | "processing" | "processed" | "failed";
}

/**
 * Admin refund. Phase 1 (one transaction, payment row locked): re-quote,
 * insert the refund row, debit the credits on the ledger, mark the
 * payment refunded, audit. Phase 2: ask Razorpay (sendRefund). If phase 2
 * fails the refund stays `pending` and `retryRefund` finishes it; the
 * user's credits are already gone, so the money is owed, never doubled.
 */
export async function refundPayment(
  db: Database,
  input: { adminUserId: string; paymentRowId: string; credits?: number; reason: string },
  razorpay: Pick<RazorpayClient, "refund" | "listRefunds">,
  now = new Date(),
): Promise<RefundResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new RangeError("A refund needs a reason");

  const created = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ userId: payments.userId }).from(payments).where(eq(payments.id, input.paymentRowId)).for("update");
    if (!locked) throw new RefundError("not_found", "Payment not found");
    // Lock the wallet before counting unused credits, so a concurrent refund or AI capture can't use the same credits.
    await tx.select({ id: creditAccounts.id }).from(creditAccounts).where(eq(creditAccounts.userId, locked.userId)).for("update");
    const [existing] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.paymentId, input.paymentRowId));
    if (existing) throw new RefundError("already_refunded", "This payment has already been refunded");

    const q = await quoteRefund(tx, input.paymentRowId, now);
    if (q.blockedCode) throw new RefundError(q.blockedCode, q.blockedReason!);
    const credits = input.credits ?? q.refundableCredits;
    if (!Number.isSafeInteger(credits) || credits <= 0) throw new RangeError("Refund credits must be a positive whole number");
    if (credits > q.refundableCredits) throw new RefundError("too_many_credits", `Only ${q.refundableCredits} credits from this payment are unused`);
    const amountPaise = proRataRefundPaise(credits, q.amountPaise, q.packCredits);
    if (amountPaise <= 0) throw new RefundError("nothing_refundable", "That's less than one paisa");

    const [refund] = await tx
      .insert(refunds)
      .values({ paymentId: q.paymentRowId, userId: q.userId, adminUserId: input.adminUserId, credits, amountPaise, reason })
      .returning();
    await postLedgerEntry(tx, { userId: q.userId, type: "refund", credits: -credits, sourceType: "refund", sourceId: refund!.id, note: `Refund of ${q.razorpayPaymentId}` });
    await tx.update(payments).set({ status: "refunded", updatedAt: now }).where(eq(payments.id, q.paymentRowId));
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: "payment.refund",
      targetType: "payment",
      targetId: q.paymentRowId,
      reason,
      metadata: { refundId: refund!.id, credits, amountPaise, razorpayPaymentId: q.razorpayPaymentId },
    });
    return { refund: refund!, razorpayPaymentId: q.razorpayPaymentId };
  });

  return sendRefund(db, created.refund.id, created.razorpayPaymentId, razorpay);
}

async function sendRefund(db: Database, refundId: string, razorpayPaymentId: string, razorpay: Pick<RazorpayClient, "refund" | "listRefunds">): Promise<RefundResult> {
  const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!r) throw new RefundError("not_found", "Refund not found");
  if (r.status !== "pending" && r.status !== "failed") return { refundId: r.id, credits: r.credits, amountPaise: r.amountPaise, status: r.status };
  try {
    // A previous attempt may have reached Razorpay and lost the response: reuse it instead of refunding twice.
    const prior = (await razorpay.listRefunds(razorpayPaymentId)).find((x) => !Array.isArray(x.notes) && x.notes?.refund_id === r.id);
    const made = prior ?? (await razorpay.refund({ paymentId: razorpayPaymentId, amountPaise: r.amountPaise, receipt: r.id.replace(/-/g, "").slice(0, 40), notes: { refund_id: r.id } }));
    const status = made.status === "processed" ? "processed" : "processing";
    await db.update(refunds).set({ razorpayRefundId: made.id, status, error: null, updatedAt: new Date() }).where(eq(refunds.id, r.id));
    return { refundId: r.id, credits: r.credits, amountPaise: r.amountPaise, status };
  } catch (err) {
    await db.update(refunds).set({ status: "pending", error: (err as Error).message.slice(0, 500), updatedAt: new Date() }).where(eq(refunds.id, r.id));
    return { refundId: r.id, credits: r.credits, amountPaise: r.amountPaise, status: "pending" };
  }
}

/** Finishes a refund whose Razorpay call failed (credits already debited). */
export async function retryRefund(db: Database, input: { refundId: string }, razorpay: Pick<RazorpayClient, "refund" | "listRefunds">): Promise<RefundResult> {
  const [row] = await db
    .select({ id: refunds.id, razorpayPaymentId: payments.paymentId })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(refunds.id, input.refundId));
  if (!row?.razorpayPaymentId) throw new RefundError("not_found", "Refund not found");
  return sendRefund(db, row.id, row.razorpayPaymentId, razorpay);
}

/** Refund rows for the admin payments screen. */
export async function listRefundsForPayments(db: Database, paymentRowIds: string[]) {
  if (paymentRowIds.length === 0) return [];
  return db.select().from(refunds).where(inArray(refunds.paymentId, paymentRowIds));
}

// ─── Credit packages (admin config, §2 / §16.4) ───────────────────────────

export async function adminListCreditPackages(db: Database) {
  return db.select().from(creditPackages).orderBy(creditPackages.sortOrder, creditPackages.pricePaise);
}

export interface CreditPackageInput {
  pricePaise: number;
  credits: number;
  bonusCredits: number;
  sortOrder: number;
}

function checkPack(p: CreditPackageInput) {
  if (!Number.isSafeInteger(p.pricePaise) || p.pricePaise < 100) throw new RangeError("Price must be at least ₹1");
  if (p.pricePaise % 100 !== 0) throw new RangeError("Price must be whole rupees");
  if (!Number.isSafeInteger(p.credits) || p.credits <= 0) throw new RangeError("Credits must be a positive whole number");
  if (!Number.isSafeInteger(p.bonusCredits) || p.bonusCredits < 0) throw new RangeError("Bonus can't be negative");
}

/** New pack. Prices are unique; reactivate a disabled pack instead of re-adding it. */
export async function adminCreateCreditPackage(db: Database, input: CreditPackageInput & { adminUserId: string; reason: string }) {
  checkPack(input);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: creditPackages.id }).from(creditPackages).where(eq(creditPackages.pricePaise, input.pricePaise));
    if (dup) throw new RangeError("A pack at that price already exists — enable or edit it instead");
    const [pack] = await tx
      .insert(creditPackages)
      .values({ pricePaise: input.pricePaise, credits: input.credits, bonusCredits: input.bonusCredits, sortOrder: input.sortOrder, active: true })
      .returning();
    await tx.insert(auditLogs).values({ adminUserId: input.adminUserId, action: "credit_package.create", targetType: "credit_package", targetId: pack!.id, reason: input.reason, metadata: { ...input, adminUserId: undefined, reason: undefined } });
    return pack!;
  });
}

/**
 * Change a pack. Orders already created keep the credits they were
 * created with (payments.credits is a snapshot), so an edit never changes
 * what an in-flight payment grants.
 */
export async function adminUpdateCreditPackage(db: Database, input: Partial<CreditPackageInput> & { adminUserId: string; packageId: string; active?: boolean; reason: string }) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(creditPackages).where(eq(creditPackages.id, input.packageId)).for("update");
    if (!cur) throw new RangeError("Pack not found");
    const next = {
      pricePaise: input.pricePaise ?? cur.pricePaise,
      credits: input.credits ?? cur.credits,
      bonusCredits: input.bonusCredits ?? cur.bonusCredits,
      sortOrder: input.sortOrder ?? cur.sortOrder,
      active: input.active ?? cur.active,
    };
    checkPack(next);
    if (next.pricePaise !== cur.pricePaise) {
      const [dup] = await tx.select({ id: creditPackages.id }).from(creditPackages).where(eq(creditPackages.pricePaise, next.pricePaise));
      if (dup) throw new RangeError("A pack at that price already exists");
    }
    await tx.update(creditPackages).set({ ...next, updatedAt: new Date() }).where(eq(creditPackages.id, cur.id));
    await tx.insert(auditLogs).values({
      adminUserId: input.adminUserId,
      action: next.active !== cur.active && input.pricePaise === undefined && input.credits === undefined && input.bonusCredits === undefined ? "credit_package.toggle" : "credit_package.update",
      targetType: "credit_package",
      targetId: cur.id,
      reason: input.reason,
      metadata: { before: { pricePaise: cur.pricePaise, credits: cur.credits, bonusCredits: cur.bonusCredits, sortOrder: cur.sortOrder, active: cur.active }, after: next },
    });
    return { ...cur, ...next };
  });
}
