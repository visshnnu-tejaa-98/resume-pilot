import type { Database } from "@resume-pilot/database";
import { describe, expect, it, vi } from "vitest";

const processTransactionalEmail = vi.fn().mockResolvedValue({ status: "sent", messageId: "m" });
const expireStaleHolds = vi.fn().mockResolvedValue({ expired: 2 });
const findWalletMismatches = vi.fn().mockResolvedValue([]);
const cleanupExpiredUploads = vi.fn().mockResolvedValue({ deleted: 1, failed: 0 });
vi.mock("@resume-pilot/services", () => ({
  processTransactionalEmail,
  expireStaleHolds,
  findWalletMismatches,
  cleanupExpiredUploads,
}));
vi.mock("@resume-pilot/storage", () => ({ getStorage: () => ({ deleteFile: vi.fn() }) }));

const {
  finishEmailJob,
  handleMaintenanceJob,
  handleTransactionalEmailJob,
  REDIS_URL,
  workerConfigFromEnv,
} = await import("./index");
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

describe("handleMaintenanceJob", () => {
  it("runs the hold-expiry sweep for expire-holds", async () => {
    const result = await handleMaintenanceJob("expire-holds", { db: deps.db });
    expect(expireStaleHolds).toHaveBeenCalledWith(deps.db);
    expect(result).toEqual({ expired: 2 });
  });

  it("reports wallet mismatches for reconcile-wallets", async () => {
    findWalletMismatches.mockResolvedValueOnce([
      { userId: "u", cachedBalance: 5, ledgerSum: 4, lastBalanceAfter: 4 },
    ]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await handleMaintenanceJob("reconcile-wallets", { db: deps.db });
    expect(result).toEqual({ mismatches: 1 });
    expect(spy).toHaveBeenCalledWith(
      "[worker] wallet mismatch:",
      expect.stringContaining('"ledgerSum":4'),
    );
    spy.mockRestore();
  });

  it("runs the 30-day upload cleanup with the storage delete for cleanup-uploads", async () => {
    const deleteFile = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await handleMaintenanceJob("cleanup-uploads", { db: deps.db, deleteFile });
    expect(cleanupExpiredUploads).toHaveBeenCalledWith(deps.db, deleteFile);
    expect(result).toEqual({ deleted: 1, failed: 0 });
  });

  it("fails an unknown job without retrying", async () => {
    await expect(handleMaintenanceJob("nope", { db: deps.db })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});
