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
    const getJob = vi.fn().mockResolvedValue(undefined);
    const result = await enqueueTransactionalEmail(
      { add, getJob },
      { templateKey: "welcome", userId, firstName: "Asha" },
    );
    expect(result).toBe("added");
    expect(add).toHaveBeenCalledWith(
      "welcome",
      { templateKey: "welcome", userId, firstName: "Asha" },
      expect.objectContaining({ jobId: `welcome-${userId}`, attempts: 3 }),
    );
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.backoff).toMatchObject({ type: "exponential" });
  });

  it("rejects an invalid payload before touching the queue", async () => {
    const add = vi.fn();
    const getJob = vi.fn();
    await expect(
      enqueueTransactionalEmail(
        { add, getJob },
        { templateKey: "welcome", userId: "nope", firstName: null },
      ),
    ).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
  });

  it("retries a job that exhausted its attempts instead of being silently ignored", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn();
    const getJob = vi.fn().mockResolvedValue({ isFailed: async () => true, retry });
    const result = await enqueueTransactionalEmail(
      { add, getJob },
      { templateKey: "welcome", userId, firstName: null },
    );
    expect(result).toBe("retried");
    expect(retry).toHaveBeenCalledWith("failed");
    expect(add).not.toHaveBeenCalled();
  });

  it("leaves a waiting/active/completed job alone", async () => {
    const retry = vi.fn();
    const add = vi.fn();
    const getJob = vi.fn().mockResolvedValue({ isFailed: async () => false, retry });
    const result = await enqueueTransactionalEmail(
      { add, getJob },
      { templateKey: "welcome", userId, firstName: null },
    );
    expect(result).toBe("exists");
    expect(retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("redisUrlFromEnv", () => {
  it("defaults to local Redis and honours REDIS_URL", () => {
    expect(redisUrlFromEnv({})).toBe("redis://127.0.0.1:6379");
    expect(redisUrlFromEnv({ REDIS_URL: "redis://x:1" })).toBe("redis://x:1");
  });
});

describe("registerMaintenanceSchedules", () => {
  it("upserts one schedule per maintenance job, including hold expiry every minute", async () => {
    const { registerMaintenanceSchedules, MAINTENANCE_JOBS } = await import("./index");
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    await registerMaintenanceSchedules({ upsertJobScheduler });

    expect(upsertJobScheduler).toHaveBeenCalledTimes(Object.keys(MAINTENANCE_JOBS).length);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "expire-holds",
      { every: 60_000 },
      expect.objectContaining({ name: "expire-holds" }),
    );
  });
});
