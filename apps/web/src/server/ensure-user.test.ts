import { randomUUID } from "node:crypto";
import { createDatabase, users, type Database } from "@resume-pilot/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queueAdd = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/queue", () => ({
  getTransactionalEmailQueue: () => ({ add: queueAdd, getJob: async () => undefined }),
}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser } }) }));

const connectionString = process.env.DATABASE_URL;

function clerkUser(id: string, email: string, firstName: string | null) {
  return {
    id,
    firstName,
    primaryEmailAddressId: "idn_1",
    emailAddresses: [{ id: "idn_1", emailAddress: email }],
  };
}

// The fallback that provisions users when the Clerk webhook can't reach
// this server (local dev). It must send the same welcome email.
describe.skipIf(!connectionString)("ensureUserSynced (real DB)", () => {
  let db: Database;
  const clerkIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(connectionString ?? "");
  });

  beforeEach(() => {
    queueAdd.mockReset().mockResolvedValue(undefined);
    getUser.mockReset();
  });

  afterAll(async () => {
    for (const id of clerkIds) await db.delete(users).where(eq(users.clerkUserId, id));
    await db.$client.end();
  });

  it("provisions a new user and queues their welcome email", async () => {
    const { ensureUserSynced } = await import("./ensure-user");
    const clerkUserId = `clerk_${randomUUID()}`;
    clerkIds.push(clerkUserId);
    getUser.mockResolvedValue(clerkUser(clerkUserId, "fallback@example.com", "Meera"));

    const user = await ensureUserSynced(clerkUserId);

    expect(user.email).toBe("fallback@example.com");
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "welcome",
      { templateKey: "welcome", userId: user.id, firstName: "Meera" },
      expect.objectContaining({ jobId: `welcome-${user.id}` }),
    );
  });

  it("does nothing for a user that already exists (no Clerk call, no email)", async () => {
    const { ensureUserSynced } = await import("./ensure-user");
    const clerkUserId = `clerk_${randomUUID()}`;
    clerkIds.push(clerkUserId);
    getUser.mockResolvedValue(clerkUser(clerkUserId, "existing@example.com", null));
    await ensureUserSynced(clerkUserId);
    queueAdd.mockClear();
    getUser.mockClear();

    await ensureUserSynced(clerkUserId);

    expect(getUser).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("still lets the user in when the queue is down", async () => {
    const { ensureUserSynced } = await import("./ensure-user");
    const clerkUserId = `clerk_${randomUUID()}`;
    clerkIds.push(clerkUserId);
    getUser.mockResolvedValue(clerkUser(clerkUserId, "redis-down@example.com", "Kiran"));
    queueAdd.mockRejectedValue(new Error("ECONNREFUSED"));

    const user = await ensureUserSynced(clerkUserId);
    expect(user.email).toBe("redis-down@example.com");
  });
});
