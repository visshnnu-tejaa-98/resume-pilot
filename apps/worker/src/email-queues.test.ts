import { randomUUID } from "node:crypto";
import { createRedisConnection, enqueueMarketingEmails, enqueueTransactionalEmail, redisUrlFromEnv, TRANSACTIONAL_EMAIL_JOB_OPTIONS } from "@resume-pilot/queue";
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * prd.md §13.2 done-when: a large campaign never delays a transactional
 * email. Same shape as production — separate queues, the marketing worker
 * rate-limited — on throwaway queue names so it can't touch real jobs.
 */
const probe = createRedisConnection(redisUrlFromEnv());
const redisUp = await Promise.race([probe.ping().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1500))]).catch(() => false);
probe.disconnect();

describe.skipIf(!redisUp)("transactional vs marketing queues (real Redis)", () => {
  const id = randomUUID().slice(0, 8);
  const conn = createRedisConnection();
  const mkt = new Queue(`test-mkt-${id}`, { connection: conn });
  const tx = new Queue(`test-tx-${id}`, { connection: conn });
  const workers: Worker[] = [];
  const sentMarketing: number[] = [];
  let receiptAt = 0;

  beforeAll(() => {
    workers.push(
      new Worker(`test-mkt-${id}`, async () => void sentMarketing.push(Date.now()), { connection: createRedisConnection(), concurrency: 2, limiter: { max: 10, duration: 60_000 } }),
      new Worker(`test-tx-${id}`, async () => void (receiptAt = Date.now()), { connection: createRedisConnection(), concurrency: 5 }),
    );
  });
  afterAll(async () => {
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all([mkt.obliterate({ force: true }), tx.obliterate({ force: true })]);
    await Promise.all([mkt.close(), tx.close()]);
    await conn.quit();
  });

  it("a 2,000-recipient campaign doesn't hold up a receipt queued after it", async () => {
    const jobs = Array.from({ length: 2000 }, () => ({ templateKey: "new_features" as const, userId: randomUUID(), campaignId: randomUUID() }));
    await enqueueMarketingEmails(mkt as never, jobs);
    const queuedAt = Date.now();
    await enqueueTransactionalEmail(tx as never, { templateKey: "recharge_success", userId: randomUUID(), paymentId: randomUUID() });
    expect(TRANSACTIONAL_EMAIL_JOB_OPTIONS.attempts).toBe(3);

    const deadline = Date.now() + 10_000;
    while (!receiptAt && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(receiptAt).toBeGreaterThan(0);
    expect(receiptAt - queuedAt).toBeLessThan(5_000); // SLA is 2 minutes; this is seconds
    // Meanwhile the campaign is throttled to its per-minute limit.
    expect(sentMarketing.length).toBeLessThanOrEqual(10);
    expect(await mkt.getWaitingCount()).toBeGreaterThan(1900);
  }, 20_000);
});
