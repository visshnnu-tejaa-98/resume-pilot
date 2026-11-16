import { randomUUID } from "node:crypto";
import {
  coupons,
  createDatabase,
  emailMessages,
  emailSuppressions,
  users,
  type Database,
} from "@resume-pilot/database";
import { render } from "@react-email/render";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentRecipientRejection, processTransactionalEmail, type SendFn } from "./email";
import { createUserFromClerkWebhook } from "./user";

const connectionString = process.env.DATABASE_URL;

describe("isPermanentRecipientRejection", () => {
  it("treats a 5xx on RCPT TO / EENVELOPE as a hard bounce", () => {
    expect(isPermanentRecipientRejection({ responseCode: 550, command: "RCPT TO" })).toBe(true);
    expect(isPermanentRecipientRejection({ responseCode: 553, code: "EENVELOPE" })).toBe(true);
  });

  it("does not treat 4xx, auth or connection errors as hard bounces", () => {
    expect(isPermanentRecipientRejection({ responseCode: 421, command: "RCPT TO" })).toBe(false);
    expect(isPermanentRecipientRejection({ responseCode: 535, command: "AUTH PLAIN" })).toBe(false);
    expect(isPermanentRecipientRejection(new Error("ECONNRESET"))).toBe(false);
    expect(isPermanentRecipientRejection(null)).toBe(false);
  });
});

describe.skipIf(!connectionString)("processTransactionalEmail: welcome (real DB)", () => {
  let db: Database;
  const userIds: string[] = [];
  const emails: string[] = [];
  const couponCode = `TEST${randomUUID().slice(0, 8).toUpperCase()}`;

  async function newUser() {
    const email = `welcome-${randomUUID()}@example.com`;
    const { userId } = await createUserFromClerkWebhook(db, {
      clerkUserId: `clerk_${randomUUID()}`,
      email,
    });
    userIds.push(userId);
    emails.push(email);
    return { userId, email };
  }

  function ctx(send: SendFn, overrides: Partial<{ isFinalAttempt: boolean; code: string }> = {}) {
    return {
      send,
      appUrl: "https://app.example.com/",
      launchCouponCode: overrides.code ?? couponCode,
      isFinalAttempt: overrides.isFinalAttempt ?? false,
    };
  }

  const okSend = () => vi.fn<SendFn>().mockResolvedValue({ messageId: `<${randomUUID()}@smtp>` });

  async function messageFor(userId: string) {
    const [row] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.idempotencyKey, `welcome:${userId}`));
    return row;
  }

  beforeAll(async () => {
    db = createDatabase(connectionString ?? "");
    await db.insert(coupons).values({ code: couponCode, credits: 750, active: true });
  });

  afterAll(async () => {
    await db.delete(emailMessages).where(inArray(emailMessages.userId, userIds));
    await db.delete(emailSuppressions).where(inArray(emailSuppressions.email, emails));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(coupons).where(eq(coupons.code, couponCode));
    await db.$client.end();
  });

  it("sends once, logs it as sent with the provider id, and uses the DB coupon", async () => {
    const { userId, email } = await newUser();
    const send = okSend();

    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: " Asha " },
      ctx(send),
    );

    expect(result.status).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0]![0];
    expect(call.to).toBe(email);
    expect(call.subject).toBe("Welcome to Resume Pilot, Asha");
    const html = await render(call.element);
    expect(html).toContain(couponCode);
    expect(html).toContain("750 free credits");
    expect(html).toContain("https://app.example.com/upload");
    expect(html).toContain("https://app.example.com/wallet");

    const row = await messageFor(userId);
    expect(row?.status).toBe("sent");
    expect(row?.providerMessageId).toBe(result.status === "sent" ? result.messageId : "");
    expect(row?.templateKey).toBe("welcome");
  });

  it("never sends twice for the same user, sequentially or concurrently", async () => {
    const { userId } = await newUser();
    const send = okSend();
    const job = { templateKey: "welcome" as const, userId, firstName: "Ravi" };

    const results = await Promise.all(
      [1, 2, 3].map(() => processTransactionalEmail(db, job, ctx(send))),
    );
    const again = await processTransactionalEmail(db, job, ctx(send));

    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(again.status).toBe("already_sent");
    const rows = await db.select().from(emailMessages).where(eq(emailMessages.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("falls back to 'there' when Clerk gave no first name", async () => {
    const { userId } = await newUser();
    const send = okSend();
    await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: null },
      ctx(send),
    );
    expect(send.mock.calls[0]![0].subject).toBe("Welcome to Resume Pilot, there");
  });

  it("hides the gift when the launch coupon is inactive or missing", async () => {
    const { userId } = await newUser();
    const send = okSend();
    await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send, { code: "NO_SUCH_CODE" }),
    );
    const html = await render(send.mock.calls[0]![0].element);
    expect(html).not.toContain("Claim");
    expect(html).toContain("100 free credits");
  });

  it("skips (and never retries) a hard-bounced address", async () => {
    const { userId, email } = await newUser();
    await db
      .insert(emailSuppressions)
      .values({ email: email.toUpperCase(), reason: "hard_bounce" });
    const send = okSend();

    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send),
    );

    expect(result.status).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect((await messageFor(userId))?.status).toBe("skipped");
    // A later job for the same key stays skipped.
    await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("still sends welcome to an address that only unsubscribed from marketing", async () => {
    const { userId, email } = await newUser();
    await db.insert(emailSuppressions).values({ email, reason: "unsubscribe_all" });
    const send = okSend();
    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send),
    );
    expect(result.status).toBe("sent");
  });

  it("skips suspended users", async () => {
    const { userId } = await newUser();
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, userId));
    const send = okSend();
    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send),
    );
    expect(result).toEqual({ status: "skipped", reason: "user suspended" });
    expect(send).not.toHaveBeenCalled();
  });

  it("a 550 recipient rejection marks failed, suppresses the address, and doesn't throw (no retry)", async () => {
    const { userId, email } = await newUser();
    const send = vi.fn<SendFn>().mockRejectedValue(
      Object.assign(new Error("550 5.1.1 No such user"), {
        responseCode: 550,
        command: "RCPT TO",
      }),
    );

    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send),
    );

    expect(result.status).toBe("failed_permanent");
    const row = await messageFor(userId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("550");
    const [sup] = await db
      .select()
      .from(emailSuppressions)
      .where(sql`lower(${emailSuppressions.email}) = lower(${email})`);
    expect(sup?.reason).toBe("hard_bounce");
  });

  it("a transient error throws for retry, leaves the row queued, then succeeds on retry", async () => {
    const { userId } = await newUser();
    const send = vi
      .fn<SendFn>()
      .mockRejectedValueOnce(Object.assign(new Error("421 try later"), { responseCode: 421 }))
      .mockResolvedValueOnce({ messageId: "<retry-ok@smtp>" });
    const job = { templateKey: "welcome" as const, userId, firstName: "A" };

    await expect(processTransactionalEmail(db, job, ctx(send))).rejects.toThrow(/421/);
    expect((await messageFor(userId))?.status).toBe("queued");

    const result = await processTransactionalEmail(db, job, ctx(send));
    expect(result).toEqual({ status: "sent", messageId: "<retry-ok@smtp>" });
    expect((await messageFor(userId))?.status).toBe("sent");
  });

  it("a transient error on the final attempt marks the row failed", async () => {
    const { userId } = await newUser();
    const send = vi.fn<SendFn>().mockRejectedValue(new Error("ETIMEDOUT"));
    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId, firstName: "A" },
      ctx(send, { isFinalAttempt: true }),
    );
    expect(result.status).toBe("failed_permanent");
    const row = await messageFor(userId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("ETIMEDOUT");
  });

  it("skips a user that no longer exists", async () => {
    const send = okSend();
    const result = await processTransactionalEmail(
      db,
      { templateKey: "welcome", userId: randomUUID(), firstName: "A" },
      ctx(send),
    );
    expect(result).toEqual({ status: "skipped", reason: "user not found" });
    expect(send).not.toHaveBeenCalled();
  });
});
