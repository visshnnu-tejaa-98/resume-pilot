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
  /** Raw-text extraction for uploaded resumes (prd.md §5.3). */
  extraction: "resume-extraction",
  /** Scheduled housekeeping (hold expiry, later: upload cleanup, inactive nudges). */
  maintenance: "maintenance",
  /** Paid AI actions run under a credit hold (JD analysis; later generation, scoring). */
  ai: "ai-jobs",
} as const;

/** Maintenance job names, each run on a schedule by the worker. */
export const MAINTENANCE_JOBS = {
  /** Releases credit holds older than 15 minutes (prd.md §3.4 step 6). */
  expireHolds: { name: "expire-holds", everyMs: 60_000 },
  /** Logs any wallet whose cached balance differs from its ledger (prd.md §3.5). */
  reconcileWallets: { name: "reconcile-wallets", everyMs: 60 * 60_000 },
  /** Deletes original uploads older than 30 days from ImageKit (prd.md §5.2). */
  cleanupUploads: { name: "cleanup-uploads", everyMs: 24 * 60 * 60_000 },
  /** Hard-deletes versions soft-deleted more than 30 days ago (prd.md §8.5). */
  purgeVersions: { name: "purge-versions", everyMs: 24 * 60 * 60_000 },
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
 * Adds a job under a fixed id. BullMQ silently ignores `add` when a job
 * with that id still exists. That's right for waiting/active/completed
 * jobs (in flight or done), but a job that exhausted its attempts is
 * kept for weeks and would block any re-run, so a failed job is retried
 * instead. Callers keep their own durable idempotency (DB rows).
 */
export async function addUniqueJob<T>(
  queue: Pick<Queue<T>, "add" | "getJob">,
  name: string,
  data: T,
  opts: JobsOptions & { jobId: string },
  /** Also replace a *completed* job (for work the user can legitimately re-run). */
  replaceCompleted = false,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const existing = await queue.getJob(opts.jobId);
  if (existing) {
    if (await existing.isFailed()) {
      await existing.retry("failed");
      return "retried";
    }
    if (replaceCompleted && (await existing.isCompleted())) {
      await existing.remove();
      await queue.add(name as never, data as never, opts);
      return "replaced";
    }
    return "exists";
  }
  await queue.add(name as never, data as never, opts);
  return "added";
}

/** Validates the payload, then enqueues with the idempotent job id. */
export async function enqueueTransactionalEmail(
  queue: Pick<Queue<TransactionalEmailJob>, "add" | "getJob">,
  job: TransactionalEmailJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = transactionalEmailJobSchema.parse(job);
  return addUniqueJob(queue, data.templateKey, data, {
    ...TRANSACTIONAL_EMAIL_JOB_OPTIONS,
    jobId: emailJobId(data),
  });
}

// --- Resume extraction ---------------------------------------------------

export const extractionJobSchema = z.object({ resumeId: z.uuid() });
export type ExtractionJob = z.infer<typeof extractionJobSchema>;

/** OCR can be slow; 3 attempts with 15 s / 30 s backoff for transient errors. */
export const EXTRACTION_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export function createExtractionQueue(connection: IORedis): Queue<ExtractionJob> {
  return new Queue<ExtractionJob>(QUEUE_NAMES.extraction, { connection });
}

/**
 * One extraction job per resume. A user's retry re-runs it even if the
 * last run completed (a permanent failure like a blurry photo completes
 * the job, not fails it). Double work is prevented by the resume's
 * status: processExtraction skips anything already processed.
 */
export async function enqueueExtraction(
  queue: Pick<Queue<ExtractionJob>, "add" | "getJob">,
  job: ExtractionJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = extractionJobSchema.parse(job);
  return addUniqueJob(
    queue,
    "extract",
    data,
    { ...EXTRACTION_JOB_OPTIONS, jobId: `extract-${data.resumeId}` },
    true,
  );
}

// --- Paid AI actions ---------------------------------------------------------

/** JD analysis (prd.md §7.2). The hold already exists; `aiJobId` ties the run to it. */
export const jdAnalysisJobSchema = z.object({ aiJobId: z.uuid(), jdId: z.uuid() });
export type JdAnalysisJob = z.infer<typeof jdAnalysisJobSchema>;

/**
 * Two attempts (one retry after 10 s) for transient model/API errors.
 * Well inside the 15-minute hold, so the hold can't expire mid-retry
 * under normal conditions; the sweeper releases it if it somehow does.
 */
export const AI_JOB_OPTIONS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { age: 7 * 24 * 3600 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

/** Tailored resume generation (prd.md §8.1). Inputs live on the ai_jobs row. */
export const generationJobSchema = z.object({ aiJobId: z.uuid() });
export type GenerationJob = z.infer<typeof generationJobSchema>;

/** ATS scoring (prd.md §9.1). Inputs live on the ai_jobs row. */
export const scoringJobSchema = z.object({ aiJobId: z.uuid() });
export type ScoringJob = z.infer<typeof scoringJobSchema>;

/** Everything on the AI queue; the BullMQ job name says which. */
export type AiQueueJob = JdAnalysisJob | GenerationJob | ScoringJob;

export async function enqueueScoring(
  queue: Pick<Queue<AiQueueJob>, "add" | "getJob">,
  job: ScoringJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = scoringJobSchema.parse(job);
  return addUniqueJob(queue, "ats-scoring", data, { ...AI_JOB_OPTIONS, jobId: `ats-scoring-${data.aiJobId}` });
}

export function createAiQueue(connection: IORedis): Queue<AiQueueJob> {
  return new Queue<AiQueueJob>(QUEUE_NAMES.ai, { connection });
}

/** One queue job per generation AI job (= per hold). */
export async function enqueueGeneration(
  queue: Pick<Queue<AiQueueJob>, "add" | "getJob">,
  job: GenerationJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = generationJobSchema.parse(job);
  // Generation retries the model inside the call (grounding retry); one queue retry covers API blips.
  return addUniqueJob(queue, "generation", data, { ...AI_JOB_OPTIONS, jobId: `generation-${data.aiJobId}` });
}

/** One queue job per AI job (= per hold), so a duplicate enqueue is a no-op. */
export async function enqueueJdAnalysis(
  queue: Pick<Queue<AiQueueJob>, "add" | "getJob">,
  job: JdAnalysisJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = jdAnalysisJobSchema.parse(job);
  return addUniqueJob(queue, "jd-analysis", data, { ...AI_JOB_OPTIONS, jobId: `jd-analysis-${data.aiJobId}` });
}

// --- Process-wide producers ------------------------------------------------

let producerConnection: IORedis | undefined;
let transactionalEmailQueue: Queue<TransactionalEmailJob> | undefined;
let extractionQueue: Queue<ExtractionJob> | undefined;
let aiQueue: Queue<AiQueueJob> | undefined;

/** One Redis connection shared by every producer queue in this process (web app). */
function producer(): IORedis {
  producerConnection ??= createRedisConnection();
  return producerConnection;
}

export function getTransactionalEmailQueue(): Queue<TransactionalEmailJob> {
  transactionalEmailQueue ??= createTransactionalEmailQueue(producer());
  return transactionalEmailQueue;
}

export function getAiQueue(): Queue<AiQueueJob> {
  aiQueue ??= createAiQueue(producer());
  return aiQueue;
}

export function getExtractionQueue(): Queue<ExtractionJob> {
  extractionQueue ??= createExtractionQueue(producer());
  return extractionQueue;
}

/**
 * Text → JSON for a resume whose raw text is ready (prd.md §5.3 step 4).
 * Same queue and options as extraction; job name "structure". Retries
 * of a completed job are allowed (a user retry after a failure).
 */
export async function enqueueStructuring(
  queue: Pick<Queue<ExtractionJob>, "add" | "getJob">,
  job: ExtractionJob,
): Promise<"added" | "retried" | "replaced" | "exists"> {
  const data = extractionJobSchema.parse(job);
  return addUniqueJob(
    queue,
    "structure",
    data,
    { ...EXTRACTION_JOB_OPTIONS, jobId: `structure-${data.resumeId}` },
    true,
  );
}
