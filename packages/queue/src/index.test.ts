import { describe, expect, it, vi } from "vitest";
import {
  emailIdempotencyKey,
  emailJobId,
  enqueueTransactionalEmail,
  redisUrlFromEnv,
  TRANSACTIONAL_EMAIL_JOB_OPTIONS,
} from "./index";

const userId = "8a5f0f0e-2b8e-4c1e-9d3f-0a1b2c3d4e5f";

describe("email job ids", () => {
  it("idempotency key is template key + source id", () => {
    expect(emailIdempotencyKey({ templateKey: "welcome", userId, firstName: "Asha" })).toBe(
      `welcome:${userId}`,
    );
  });

  it("job id has no ':' (BullMQ forbids it) and is stable per user", () => {
    const a = emailJobId({ templateKey: "welcome", userId, firstName: "Asha" });
    const b = emailJobId({ templateKey: "welcome", userId, firstName: null });
    expect(a).not.toContain(":");
    expect(a).toBe(b);
  });
});

describe("enqueueTransactionalEmail", () => {
  it("adds with the idempotent job id and 3 attempts with backoff", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    await enqueueTransactionalEmail({ add }, { templateKey: "welcome", userId, firstName: "Asha" });
    expect(add).toHaveBeenCalledWith(
      "welcome",
      { templateKey: "welcome", userId, firstName: "Asha" },
      expect.objectContaining({ jobId: `welcome-${userId}`, attempts: 3 }),
    );
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.backoff).toMatchObject({ type: "exponential" });
  });

  it("rejects an invalid payload before touching the queue", async () => {
    const add = vi.fn();
    await expect(
      enqueueTransactionalEmail(
        { add },
        { templateKey: "welcome", userId: "nope", firstName: null },
      ),
    ).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("redisUrlFromEnv", () => {
  it("defaults to local Redis and honours REDIS_URL", () => {
    expect(redisUrlFromEnv({})).toBe("redis://127.0.0.1:6379");
    expect(redisUrlFromEnv({ REDIS_URL: "redis://x:1" })).toBe("redis://x:1");
  });
});
