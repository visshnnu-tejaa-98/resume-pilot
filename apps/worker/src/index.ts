import { createDatabase, type Database } from "@resume-pilot/database";
import { sendEmail } from "@resume-pilot/emails";
import {
  createMaintenanceQueue,
  createRedisConnection,
  MAINTENANCE_JOBS,
  QUEUE_NAMES,
  registerMaintenanceSchedules,
  redisUrlFromEnv,
  transactionalEmailJobSchema,
  type TransactionalEmailJob,
} from "@resume-pilot/queue";
import {
  expireStaleHolds,
  findWalletMismatches,
  processTransactionalEmail,
  type EmailProcessContext,
  type EmailProcessResult,
} from "@resume-pilot/services";
import { UnrecoverableError, Worker, type Job } from "bullmq";

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

/**
 * A permanent failure (hard bounce, or the final attempt of a transient
 * error) is already recorded in `email_messages`; throwing
 * UnrecoverableError marks the BullMQ job *failed* without spending
 * more attempts. Returning normally would mark it completed, and
 * enqueueTransactionalEmail only re-runs failed jobs, so the email
 * could never be re-triggered.
 */
export function finishEmailJob(result: EmailProcessResult): EmailProcessResult {
  if (result.status === "failed_permanent") {
    throw new UnrecoverableError(result.reason);
  }
  return result;
}

export function createTransactionalEmailWorker(db: Database, config: WorkerConfig): Worker {
  const worker = new Worker<TransactionalEmailJob>(
    QUEUE_NAMES.emailTransactional,
    async (job) => {
      const result = await handleTransactionalEmailJob(job, { db, send: sendEmail, config });
      console.log(`[worker] email ${job.id}: ${result.status}`);
      return finishEmailJob(result);
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

/** Runs one maintenance job by name. Exported for tests. */
export async function handleMaintenanceJob(name: string, deps: { db: Database }) {
  switch (name) {
    case MAINTENANCE_JOBS.expireHolds.name:
      return expireStaleHolds(deps.db);
    case MAINTENANCE_JOBS.reconcileWallets.name: {
      const mismatches = await findWalletMismatches(deps.db);
      for (const m of mismatches) {
        // Should never happen; every balance change goes through postLedgerEntry.
        console.error("[worker] wallet mismatch:", JSON.stringify(m));
      }
      return { mismatches: mismatches.length };
    }
    default:
      throw new UnrecoverableError(`Unknown maintenance job "${name}"`);
  }
}

export function createMaintenanceWorker(db: Database): Worker {
  const worker = new Worker(
    QUEUE_NAMES.maintenance,
    async (job) => {
      const result = await handleMaintenanceJob(job.name, { db });
      if (result && "expired" in result && result.expired > 0) {
        console.log(`[worker] ${job.name}: released ${result.expired} expired hold(s)`);
      }
      return result;
    },
    // One at a time: these are sweeps, not per-user work.
    { connection: createRedisConnection(REDIS_URL), concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] ${job?.name} failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error("[worker] maintenance worker error:", err.message);
  });
  return worker;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[worker] DATABASE_URL is not set");
    process.exit(1);
  }
  const config = workerConfigFromEnv();
  const db = createDatabase(databaseUrl);

  console.log("[worker] starting");
  const workers = [createTransactionalEmailWorker(db, config), createMaintenanceWorker(db)];

  const maintenanceConnection = createRedisConnection(REDIS_URL);
  const maintenanceQueue = createMaintenanceQueue(maintenanceConnection);
  await registerMaintenanceSchedules(maintenanceQueue);
  await maintenanceQueue.close();
  await maintenanceConnection.quit();

  console.log(
    `[worker] listening on queues "${QUEUE_NAMES.emailTransactional}", "${QUEUE_NAMES.maintenance}"`,
  );

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
  main().catch((err) => {
    console.error("[worker] failed to start:", err);
    process.exit(1);
  });
}
