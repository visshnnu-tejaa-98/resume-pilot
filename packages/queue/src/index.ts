import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";

/**
 * Queue names, job payloads and enqueue helpers shared by `apps/web`
 * (producer) and `apps/worker` (consumer) — prd.md §13.2.
 *
 * Transactional and marketing email use separate queues so a large
 * campaign never delays a receipt. BullMQ forbids ":" in queue names
 * and custom job ids, hence the dashes.
 */
export const QUEUE_NAMES = {
  emailTransactional: "email-transactional",
  /** Scheduled housekeeping (hold expiry, later: upload cleanup, inactive nudges). */
  maintenance: "maintenance",
} as const;

/** Maintenance job names, each run on a schedule by the worker. */
export const MAINTENANCE_JOBS = {
  /** Releases credit holds older than 15 minutes (prd.md §3.4 step 6). */
  expireHolds: { name: "expire-holds", everyMs: 60_000 },
  /** Logs any wallet whose cached balance differs from its ledger (prd.md §3.5). */
  reconcileWallets: { name: "reconcile-wallets", everyMs: 60 * 60_000 },
  /** Deletes original uploads older than 30 days from ImageKit (prd.md §5.2). */
  cleanupUploads: { name: "cleanup-uploads", everyMs: 24 * 60 * 60_000 },
} as const;

export type MaintenanceJobName = (typeof MAINTENANCE_JOBS)[keyof typeof MAINTENANCE_JOBS]["name"];

export function createMaintenanceQueue(connection: IORedis): Queue {
  return new Queue(QUEUE_NAMES.maintenance, { connection });
}

/**
 * Registers every maintenance schedule. Idempotent: upsertJobScheduler
 * replaces an existing schedule with the same id, so each worker start
 * (or several replicas) keeps exactly one schedule per job.
 */
export async function registerMaintenanceSchedules(queue: Pick<Queue, "upsertJobScheduler">) {
  for (const job of Object.values(MAINTENANCE_JOBS)) {
    await queue.upsertJobScheduler(
      job.name,
      { every: job.everyMs },
      { name: job.name, opts: { removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } } },
    );
  }
}

/** Every transactional email job. `templateKey` picks the processor. */
export const transactionalEmailJobSchema = z.discriminatedUnion("templateKey", [
  z.object({
    templateKey: z.literal("welcome"),
    userId: z.uuid(),
    /** From Clerk at signup; not stored on `users`, so it travels as merge data. */
    firstName: z.string().max(200).nullable(),
  }),
]);
export type TransactionalEmailJob = z.infer<typeof transactionalEmailJobSchema>;

/**
 * Idempotency key = template key + source id (prd.md §13.1). Used both
 * as the BullMQ job id (so duplicate enqueues collapse while the job is
 * retained) and as `email_messages.idempotency_key` (the durable guard
 * that makes a second send impossible).
 */
export function emailIdempotencyKey(job: TransactionalEmailJob): string {
  switch (job.templateKey) {
    case "welcome":
      return `welcome:${job.userId}`;
  }
}

/** Job id form of the idempotency key — BullMQ disallows ":" in custom ids. */
export function emailJobId(job: TransactionalEmailJob): string {
  return emailIdempotencyKey(job).replaceAll(":", "-");
}

/** Failed sends retry with backoff, 3 attempts total (prd.md §13.2); 10 s, 20 s keeps the 2-minute SLA. */
export const TRANSACTIONAL_EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export function redisUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.REDIS_URL || "redis://127.0.0.1:6379";
}

/**
 * Redis connection for BullMQ. `family: 0` resolves IPv4 and IPv6 —
 * Railway's private network (*.railway.internal) is IPv6-only and
 * ioredis defaults to IPv4.
 */
export function createRedisConnection(url: string = redisUrlFromEnv()): IORedis {
  const connection = new IORedis(url, {
    // Required by BullMQ for blocking commands.
    maxRetriesPerRequest: null,
    family: 0,
  });
  connection.on("error", (err) => {
    console.error("[queue] redis connection error (will retry):", err.message);
  });
  return connection;
}

export function createTransactionalEmailQueue(connection: IORedis): Queue<TransactionalEmailJob> {
  return new Queue<TransactionalEmailJob>(QUEUE_NAMES.emailTransactional, { connection });
}

/**
 * Validates the payload, then enqueues with the idempotent job id.
 *
 * BullMQ silently ignores `add` when a job with the same id still
 * exists. That's what we want for waiting/active/completed jobs (the
 * email is in flight or sent), but a job that exhausted its attempts
 * is kept for 30 days and would block any re-enqueue, so a failed job
 * is retried instead. `email_messages` still guarantees one send.
 */
export async function enqueueTransactionalEmail(
  queue: Pick<Queue<TransactionalEmailJob>, "add" | "getJob">,
  job: TransactionalEmailJob,
): Promise<"added" | "retried" | "exists"> {
  const data = transactionalEmailJobSchema.parse(job);
  const jobId = emailJobId(data);

  const existing = await queue.getJob(jobId);
  if (existing) {
    if (await existing.isFailed()) {
      await existing.retry("failed");
      return "retried";
    }
    return "exists";
  }

  await queue.add(data.templateKey, data, { ...TRANSACTIONAL_EMAIL_JOB_OPTIONS, jobId });
  return "added";
}
