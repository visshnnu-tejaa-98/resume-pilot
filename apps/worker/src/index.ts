import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Generic placeholder queue. Real per-action queues (extraction, JD
 * analysis, generation, scoring, PDF, email) land milestone by
 * milestone — see tasks/todo/m2-credits onward.
 */
export const QUEUE_NAME = "resume-pilot-jobs";

export function createConnection(): IORedis {
  const connection = new IORedis(REDIS_URL, {
    // Required by BullMQ for blocking commands.
    maxRetriesPerRequest: null,
    // Resolve both IPv4 and IPv6. Railway's private network
    // (*.railway.internal) is IPv6-only, and ioredis defaults to IPv4.
    family: 0,
  });
  connection.on("error", (err) => {
    console.error("[worker] redis connection error (will retry):", err.message);
  });
  return connection;
}

export function createWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      console.log(`[worker] received job ${job.id} (${job.name}) — no processors wired yet`);
    },
    { connection: createConnection() },
  );

  worker.on("error", (err) => {
    console.error("[worker] worker error:", err.message);
  });

  return worker;
}

function main() {
  console.log("[worker] starting");
  const worker = createWorker();
  console.log(`[worker] listening on queue "${QUEUE_NAME}"`);

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.env.VITEST !== "true") {
  main();
}
