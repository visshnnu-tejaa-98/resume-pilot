import { createDatabase, type Database } from "@resume-pilot/database";
import { sendEmail } from "@resume-pilot/emails";
import {
  createRedisConnection,
  QUEUE_NAMES,
  redisUrlFromEnv,
  transactionalEmailJobSchema,
  type TransactionalEmailJob,
} from "@resume-pilot/queue";
import { processTransactionalEmail, type EmailProcessContext } from "@resume-pilot/services";
import { Worker, type Job } from "bullmq";

export const REDIS_URL = redisUrlFromEnv();

export interface WorkerConfig {
  appUrl: string;
  launchCouponCode: string;
}

export function workerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    appUrl: env.APP_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    launchCouponCode: env.LAUNCH_COUPON_CODE || "EARLYBIRD",
  };
}

/**
 * Turns a BullMQ job into a processTransactionalEmail call. Exported
 * for tests. `isFinalAttempt` tells the service to record `failed`
 * instead of throwing for another retry.
 */
export async function handleTransactionalEmailJob(
  job: Pick<Job<TransactionalEmailJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database; send: EmailProcessContext["send"]; config: WorkerConfig },
) {
  const data = transactionalEmailJobSchema.parse(job.data);
  const attempts = job.opts.attempts ?? 1;
  // attemptsMade counts finished attempts, so the current one is attemptsMade + 1.
  const isFinalAttempt = job.attemptsMade + 1 >= attempts;
  return processTransactionalEmail(deps.db, data, {
    send: deps.send,
    appUrl: deps.config.appUrl,
    launchCouponCode: deps.config.launchCouponCode,
    isFinalAttempt,
  });
}

export function createTransactionalEmailWorker(db: Database, config: WorkerConfig): Worker {
  const worker = new Worker<TransactionalEmailJob>(
    QUEUE_NAMES.emailTransactional,
    async (job) => {
      const result = await handleTransactionalEmailJob(job, { db, send: sendEmail, config });
      console.log(`[worker] email ${job.id}: ${result.status}`);
      return result;
    },
    { connection: createRedisConnection(REDIS_URL), concurrency: 5 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] email ${job?.id} attempt ${job?.attemptsMade} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error("[worker] worker error:", err.message);
  });
  return worker;
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[worker] DATABASE_URL is not set");
    process.exit(1);
  }
  const config = workerConfigFromEnv();
  const db = createDatabase(databaseUrl);

  console.log("[worker] starting");
  const workers = [createTransactionalEmailWorker(db, config)];
  console.log(`[worker] listening on queue "${QUEUE_NAMES.emailTransactional}"`);

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    await db.$client.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.env.VITEST !== "true") {
  main();
}
