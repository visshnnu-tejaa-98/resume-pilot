import { randomUUID } from "node:crypto";
import { createDatabase, users, type Database } from "@resume-pilot/database";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.DATABASE_URL;
const TEST_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"; // a syntactically valid test-only svix secret

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

function userCreatedPayload(clerkUserId: string, email: string) {
  return JSON.stringify({
    type: "user.created",
    data: {
      id: clerkUserId,
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

  afterAll(async () => {
    await db.$client.end();
  });

  it("rejects a request with an invalid signature", async () => {
    const { POST } = await import("./route");
    const body = userCreatedPayload(`clerk_${randomUUID()}`, "bad-sig@example.com");
    const req = signedRequest("whsec_totallyWrongSecretValueHere00", body);

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
});
