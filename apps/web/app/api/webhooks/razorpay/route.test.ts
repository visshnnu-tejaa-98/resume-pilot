import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createDatabase, creditAccounts, creditPackages, paymentEvents, payments, users, type Database } from "@resume-pilot/database";
import { createUserFromClerkWebhook } from "@resume-pilot/services";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Capture receipt enqueues instead of needing Redis.
const queueAdd = vi.hoisted(() => vi.fn());
vi.mock("@/server/queue", () => ({
  getTransactionalEmailQueue: () => ({ add: queueAdd, getJob: async () => undefined }),
}));

const connectionString = process.env.DATABASE_URL;
const SECRET = randomBytes(24).toString("hex");

function signed(body: string, opts: { secret?: string; eventId?: string } = {}) {
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(body).digest("hex");
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    body,
    headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": opts.eventId ?? `evt_${randomUUID()}` },
  });
}

describe.skipIf(!connectionString)("POST /api/webhooks/razorpay", () => {
  let db: Database;
  let POST: (req: Request) => Promise<Response>;
  const userIds: string[] = [];

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    db = createDatabase(connectionString!);
    ({ POST } = await import("./route"));
  });
  beforeEach(() => queueAdd.mockReset());
  afterAll(async () => {
    const pays = await db.select({ id: payments.id }).from(payments).where(inArray(payments.userId, userIds));
    if (pays.length) await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pays.map((p) => p.id)));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  async function order() {
    const { userId } = await createUserFromClerkWebhook(db, { clerkUserId: `clerk_${randomUUID()}`, email: `rzp-${randomUUID()}@example.com` });
    userIds.push(userId);
    const [pack] = await db.select().from(creditPackages).where(eq(creditPackages.pricePaise, 50_000));
    const orderId = `order_${randomUUID().slice(0, 14)}`;
    await db.insert(payments).values({ userId, packageId: pack?.id ?? null, orderId, amountPaise: 50_000, credits: 10_000 });
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: `pay_${randomUUID().slice(0, 14)}`, order_id: orderId, amount: 50_000, currency: "INR", status: "captured", method: "card" } } } });
    return { userId, body };
  }

  it("rejects a bad signature without touching the wallet", async () => {
    const { userId, body } = await order();
    const res = await POST(signed(body, { secret: "wrong" }));
    expect(res.status).toBe(400);
    expect((await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)))[0]?.balance).toBe(0);
  });

  it("grants once across a duplicate delivery, stores the raw event once, and queues the receipt", async () => {
    const { userId, body } = await order();
    const eventId = `evt_${randomUUID()}`;
    const a = await (await POST(signed(body, { eventId }))).json();
    const b = await (await POST(signed(body, { eventId }))).json();
    expect(a).toEqual({ handled: "granted", duplicate: false });
    expect(b).toEqual({ handled: "already_granted", duplicate: true });
    expect((await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)))[0]?.balance).toBe(10_000);
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.eventId, eventId))).toHaveLength(1);
    expect(queueAdd).toHaveBeenCalledWith("recharge_success", expect.objectContaining({ templateKey: "recharge_success", userId }), expect.objectContaining({ jobId: expect.stringMatching(/^recharge_success-/) }));
  });

  it("acknowledges an event for an unknown order (a retry can't fix it)", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "order_nope", amount: 1, currency: "INR", status: "captured" } } } });
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ handled: "rejected", reason: "not_found" });
  });
});
