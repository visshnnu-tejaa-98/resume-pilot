import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase, users, type Database } from "@resume-pilot/database";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real queue needs Redis; capture enqueues instead. The worker side
// (sending, idempotency, retries) is covered in services/worker tests.
const queueAdd = vi.hoisted(() => vi.fn());
vi.mock("@/server/queue", () => ({ getTransactionalEmailQueue: () => ({ add: queueAdd }) }));

const connectionString = process.env.DATABASE_URL;

// Read from .env.local (gitignored) when set, else generated fresh each
// run — a hardcoded "whsec_..."-shaped literal in tracked source trips
// secret scanners (GitGuardian etc.) even when it's fake, since they
// match on prefix pattern, not validity.
function randomTestSecret(): string {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

const TEST_SECRET = process.env.TEST_CLERK_WEBHOOK_SECRET ?? randomTestSecret();
const TEST_WRONG_SECRET = process.env.TEST_CLERK_WEBHOOK_WRONG_SECRET ?? randomTestSecret();

function signedRequest(secret: string, body: string) {
  const id = `msg_${randomUUID()}`;
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, body);
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
  });
}

function userCreatedPayload(clerkUserId: string, email: string, firstName: string | null = "Asha") {
  return JSON.stringify({
    type: "user.created",
    data: {
      id: clerkUserId,
      first_name: firstName,
      email_addresses: [{ id: "idn_1", email_address: email }],
      primary_email_address_id: "idn_1",
    },
  });
}

describe.skipIf(!connectionString)("POST /api/webhooks/clerk", () => {
  let db: Database;

  beforeAll(() => {
    process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
    db = createDatabase(connectionString ?? "");
  });

  beforeEach(() => {
    queueAdd.mockReset();
    queueAdd.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("rejects a request with an invalid signature", async () => {
    const { POST } = await import("./route");
    const body = userCreatedPayload(`clerk_${randomUUID()}`, "bad-sig@example.com");
    const req = signedRequest(TEST_WRONG_SECRET, body);

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates the user on a validly signed user.created event", async () => {
    const { POST } = await import("./route");
    const clerkUserId = `clerk_${randomUUID()}`;
    const req = signedRequest(
      TEST_SECRET,
      userCreatedPayload(clerkUserId, "webhook-e2e@example.com"),
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: boolean; userId: string };
    expect(body.created).toBe(true);

    const rows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("webhook-e2e@example.com");
  });

  it("is idempotent when Clerk delivers the same user.created event twice", async () => {
    const { POST } = await import("./route");
    const clerkUserId = `clerk_${randomUUID()}`;
    const body = userCreatedPayload(clerkUserId, "webhook-dup@example.com");

    // Clerk re-signs each delivery attempt (new svix-id/timestamp) even
    // for the same event id in the body — simulate that, not a literal
    // byte-for-byte replay.
    const first = await POST(signedRequest(TEST_SECRET, body));
    const second = await POST(signedRequest(TEST_SECRET, body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(((await first.json()) as { created: boolean }).created).toBe(true);
    expect(((await second.json()) as { created: boolean }).created).toBe(false);

    const rows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(rows).toHaveLength(1);
  });

  it("ignores non-user.created events without erroring", async () => {
    const { POST } = await import("./route");
    const body = JSON.stringify({ type: "session.created", data: { id: "sess_1" } });
    const res = await POST(signedRequest(TEST_SECRET, body));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ignored");
  });

  it("enqueues exactly one welcome job with the idempotent job id on signup", async () => {
    const { POST } = await import("./route");
    const clerkUserId = `clerk_${randomUUID()}`;
    const res = await POST(
      signedRequest(TEST_SECRET, userCreatedPayload(clerkUserId, "welcome-q@example.com")),
    );
    const { userId } = (await res.json()) as { userId: string };

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "welcome",
      { templateKey: "welcome", userId, firstName: "Asha" },
      expect.objectContaining({ jobId: `welcome-${userId}`, attempts: 3 }),
    );
  });

  it("re-enqueues with the same job id on a duplicate delivery (deduped downstream)", async () => {
    const { POST } = await import("./route");
    const body = userCreatedPayload(`clerk_${randomUUID()}`, "welcome-dup@example.com", null);
    await POST(signedRequest(TEST_SECRET, body));
    await POST(signedRequest(TEST_SECRET, body));

    expect(queueAdd).toHaveBeenCalledTimes(2);
    const [a, b] = queueAdd.mock.calls.map((c) => c[2].jobId);
    expect(a).toBe(b);
    expect(queueAdd.mock.calls[0]?.[1].firstName).toBeNull();
  });

  it("returns 500 when the queue is down so Clerk retries, and the retry enqueues", async () => {
    const { POST } = await import("./route");
    const clerkUserId = `clerk_${randomUUID()}`;
    const body = userCreatedPayload(clerkUserId, "welcome-redis-down@example.com");

    queueAdd.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const first = await POST(signedRequest(TEST_SECRET, body));
    expect(first.status).toBe(500);

    const retry = await POST(signedRequest(TEST_SECRET, body));
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { created: boolean }).created).toBe(false);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });
});
