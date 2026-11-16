import type { Database } from "@resume-pilot/database";
import { describe, expect, it, vi } from "vitest";

const processTransactionalEmail = vi.fn().mockResolvedValue({ status: "sent", messageId: "m" });
vi.mock("@resume-pilot/services", () => ({ processTransactionalEmail }));

const { finishEmailJob, handleTransactionalEmailJob, REDIS_URL, workerConfigFromEnv } =
  await import("./index");
const { UnrecoverableError } = await import("bullmq");

const userId = "8a5f0f0e-2b8e-4c1e-9d3f-0a1b2c3d4e5f";
const deps = {
  db: {} as Database,
  send: vi.fn(),
  config: { appUrl: "https://app.example.com", launchCouponCode: "EARLYBIRD" },
};

describe("worker config", () => {
  it("defaults REDIS_URL to a redis:// URL", () => {
    expect(REDIS_URL).toMatch(/^redis:\/\//);
  });

  it("prefers APP_URL, then NEXT_PUBLIC_APP_URL, then localhost", () => {
    expect(
      workerConfigFromEnv({ APP_URL: "https://a", NEXT_PUBLIC_APP_URL: "https://b" }).appUrl,
    ).toBe("https://a");
    expect(workerConfigFromEnv({ NEXT_PUBLIC_APP_URL: "https://b" }).appUrl).toBe("https://b");
    expect(workerConfigFromEnv({}).appUrl).toBe("http://localhost:3000");
    expect(workerConfigFromEnv({}).launchCouponCode).toBe("EARLYBIRD");
  });
});

describe("handleTransactionalEmailJob", () => {
  const data = { templateKey: "welcome" as const, userId, firstName: "Asha" };

  it.each([
    { attemptsMade: 0, final: false },
    { attemptsMade: 1, final: false },
    { attemptsMade: 2, final: true },
  ])("attempt $attemptsMade of 3 → isFinalAttempt=$final", async ({ attemptsMade, final }) => {
    processTransactionalEmail.mockClear();
    await handleTransactionalEmailJob({ data, attemptsMade, opts: { attempts: 3 } }, deps);
    expect(processTransactionalEmail).toHaveBeenCalledWith(
      deps.db,
      data,
      expect.objectContaining({ isFinalAttempt: final, appUrl: "https://app.example.com" }),
    );
  });

  it("rejects a malformed payload without processing it", async () => {
    processTransactionalEmail.mockClear();
    await expect(
      handleTransactionalEmailJob(
        { data: { templateKey: "welcome", userId: "x" } as never, attemptsMade: 0, opts: {} },
        deps,
      ),
    ).rejects.toThrow();
    expect(processTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("finishEmailJob", () => {
  it("passes sent / skipped / already_sent through (job completes)", () => {
    for (const r of [
      { status: "sent", messageId: "m" },
      { status: "skipped", reason: "x" },
      { status: "already_sent" },
    ] as const) {
      expect(finishEmailJob(r)).toBe(r);
    }
  });

  it("throws UnrecoverableError on a permanent failure so the job is marked failed, not completed", () => {
    expect(() =>
      finishEmailJob({ status: "failed_permanent", reason: "550 no such user" }),
    ).toThrow(UnrecoverableError);
  });
});
