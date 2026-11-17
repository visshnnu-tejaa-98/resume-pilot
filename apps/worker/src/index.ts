import { createDatabase, type Database } from "@resume-pilot/database";
import { sendEmail } from "@resume-pilot/emails";
import {
  createMaintenanceQueue,
  createRedisConnection,
  enqueueStructuring,
  extractionJobSchema,
  getExtractionQueue,
  generationJobSchema,
  scoringJobSchema,
  type ScoringJob,
  jdAnalysisJobSchema,
  type AiQueueJob,
  type GenerationJob,
  type JdAnalysisJob,
  MAINTENANCE_JOBS,
  QUEUE_NAMES,
  registerMaintenanceSchedules,
  redisUrlFromEnv,
  transactionalEmailJobSchema,
  type ExtractionJob,
  type TransactionalEmailJob,
  pdfJobSchema,
  type PdfJob,
} from "@resume-pilot/queue";
import {
  analyzeJobDescription,
  generateTailoredResume,
  scoreResume,
  SCORING_METHOD_VERSION,
  createOpenAIClient,
  structureResume,
  StructuringError,
  type ResponsesClient,
} from "@resume-pilot/ai";
import { extractText } from "@resume-pilot/file-processing/extract";
import { createTesseractOcr, type TesseractOcr } from "@resume-pilot/file-processing/ocr";
import { getStorage } from "@resume-pilot/storage";
import {
  cleanupExpiredUploads,
  expireStaleHolds,
  findWalletMismatches,
  processExtraction,
  processGeneration,
  processScoring,
  type ScoreFn,
  processJdAnalysis,
  processStructuring,
  purgeDeletedVersions,
  type GenerateFn,
  type JdAnalyzeFn,
  processTransactionalEmail,
  type ExtractionDeps,
  type StructuringDeps,
  type EmailProcessContext,
  type EmailProcessResult,
  processPdfExport,
  type PdfProcessDeps,
} from "@resume-pilot/services";
import { closeBrowser, renderResumePdf } from "./pdf";
import { UnrecoverableError, Worker, type Job } from "bullmq";

export const REDIS_URL = redisUrlFromEnv();

export interface WorkerConfig {
  appUrl: string;
  launchCouponCode: string;
  supportEmail?: string;
  postalAddress?: string;
  logoUrl?: string;
}

export function workerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    appUrl: env.APP_URL || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    launchCouponCode: env.LAUNCH_COUPON_CODE || "EARLYBIRD",
    supportEmail: env.SUPPORT_EMAIL || undefined,
    postalAddress: env.POSTAL_ADDRESS || undefined,
    logoUrl: env.EMAIL_LOGO_URL || undefined,
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
    supportEmail: deps.config.supportEmail,
    postalAddress: deps.config.postalAddress,
    logoUrl: deps.config.logoUrl,
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
export async function handleMaintenanceJob(
  name: string,
  deps: { db: Database; deleteFile?: (storageFileId: string) => Promise<void> },
) {
  switch (name) {
    case MAINTENANCE_JOBS.expireHolds.name:
      return expireStaleHolds(deps.db);
    case MAINTENANCE_JOBS.cleanupUploads.name: {
      const deleteFile = deps.deleteFile ?? ((id: string) => getStorage().deleteFile(id));
      const result = await cleanupExpiredUploads(deps.db, deleteFile);
      if (result.deleted || result.failed) {
        console.log(`[worker] cleanup-uploads: deleted ${result.deleted}, failed ${result.failed}`);
      }
      return result;
    }
    case MAINTENANCE_JOBS.reconcileWallets.name: {
      const mismatches = await findWalletMismatches(deps.db);
      for (const m of mismatches) {
        // Should never happen; every balance change goes through postLedgerEntry.
        console.error("[worker] wallet mismatch:", JSON.stringify(m));
      }
      return { mismatches: mismatches.length };
    }
    case MAINTENANCE_JOBS.purgeVersions.name: {
      const result = await purgeDeletedVersions(deps.db);
      if (result.purged) console.log(`[worker] purge-versions: ${result.purged} removed`);
      return result;
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

// --- Resume extraction (prd.md §5.3) ------------------------------------

let ocrEngine: Promise<TesseractOcr> | undefined;
/** One Tesseract engine per process, started on the first job that needs it. */
function getOcr(): Promise<TesseractOcr> {
  ocrEngine ??= createTesseractOcr().catch((err: unknown) => {
    ocrEngine = undefined; // let the next job try again
    throw err;
  });
  return ocrEngine;
}

let openai: ResponsesClient | undefined;
/** Created on first use, so a missing key fails structuring jobs only, not the worker. */
function getOpenAI(): ResponsesClient {
  try {
    openai ??= createOpenAIClient();
  } catch (err) {
    // A missing key won't fix itself on retry: fail the job straight away.
    throw new StructuringError("config_error", (err as Error).message, false, { cause: err });
  }
  return openai;
}

/** Turns a structure job into a processStructuring call. Exported for tests. */
export async function handleStructuringJob(
  job: Pick<Job<ExtractionJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database } & Omit<StructuringDeps, "isFinalAttempt">,
) {
  const { resumeId } = extractionJobSchema.parse(job.data);
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return processStructuring(deps.db, resumeId, { structure: deps.structure, isFinalAttempt });
}

/** Turns an extraction job into a processExtraction call. Exported for tests. */
export async function handleExtractionJob(
  job: Pick<Job<ExtractionJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database } & Omit<ExtractionDeps, "isFinalAttempt">,
) {
  const { resumeId } = extractionJobSchema.parse(job.data);
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return processExtraction(deps.db, resumeId, {
    readFile: deps.readFile,
    extract: deps.extract,
    isFinalAttempt,
  });
}

export function createExtractionWorker(db: Database): Worker {
  const worker = new Worker<ExtractionJob>(
    QUEUE_NAMES.extraction,
    async (job) => {
      if (job.name === "structure") {
        const outcome = await handleStructuringJob(job, {
          db,
          structure: (rawText) =>
            structureResume(getOpenAI(), {
              rawText,
              model: process.env.OPENAI_EXTRACTION_MODEL || undefined,
            }),
        });
        console.log(`[worker] structure ${job.data.resumeId}: ${outcome.status}`);
        return outcome;
      }

      const outcome = await handleExtractionJob(job, {
        db,
        readFile: (input) => getStorage().readFile(input),
        extract: async (format, files) => extractText(format, files, await getOcr()),
      });
      console.log(`[worker] extract ${job.data.resumeId}: ${outcome.status}`);
      // Text is ready: chain the JSON step (§5.3 step 4) as its own job, so a
      // model retry never redoes OCR.
      if (outcome.status === "processed") {
        await enqueueStructuring(getExtractionQueue(), { resumeId: job.data.resumeId });
      }
      return outcome;
    },
    // OCR is CPU-heavy; two at a time per worker instance.
    { connection: createRedisConnection(REDIS_URL), concurrency: 2 },
  );
  worker.on("failed", (job, err) => {
    console.error(
      `[worker] ${job?.name ?? "extraction"} ${job?.data.resumeId} attempt ${job?.attemptsMade} failed:`,
      err.message,
    );
  });
  worker.on("error", (err) => console.error("[worker] extraction worker error:", err.message));
  return worker;
}

/** Turns an AI-queue job into a processJdAnalysis call. Exported for tests. */
export async function handleJdAnalysisJob(
  job: Pick<Job<JdAnalysisJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database; analyze: JdAnalyzeFn },
) {
  const data = jdAnalysisJobSchema.parse(job.data);
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return processJdAnalysis(deps.db, data, { analyze: deps.analyze, isFinalAttempt });
}

/**
 * Paid AI actions (prd.md §3.4): each job runs under a hold placed by the
 * web app. processJdAnalysis captures on success and releases on failure;
 * only retryable errors on a non-final attempt reach BullMQ as a throw.
 */
/** Turns a generation job into a processGeneration call. Exported for tests. */
export async function handleGenerationJob(
  job: Pick<Job<GenerationJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database; generate: GenerateFn; analyze: JdAnalyzeFn },
) {
  const data = generationJobSchema.parse(job.data);
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return processGeneration(deps.db, data, { generate: deps.generate, analyze: deps.analyze, isFinalAttempt });
}

/** Turns a scoring job into a processScoring call. Exported for tests. */
export async function handleScoringJob(
  job: Pick<Job<ScoringJob>, "data" | "attemptsMade" | "opts">,
  deps: { db: Database; score: ScoreFn; analyze: JdAnalyzeFn },
) {
  const data = scoringJobSchema.parse(job.data);
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  return processScoring(deps.db, data, { score: deps.score, analyze: deps.analyze, isFinalAttempt, methodVersion: SCORING_METHOD_VERSION });
}

export function createAiWorker(db: Database): Worker {
  const analyze: JdAnalyzeFn = async (input) => {
    const r = await analyzeJobDescription(getOpenAI(), input);
    return { analysis: r.analysis, usage: r.usage };
  };
  // generateTailoredResume runs the deterministic grounding check (prd.md §8.3) and
  // throws GroundingFailedError after its one retry — nothing ungrounded is returned.
  const generate: GenerateFn = (input) => generateTailoredResume(getOpenAI(), input);
  // AI judges evidence; the score is computed in code (prd.md §9.1).
  const score: ScoreFn = (input) => scoreResume(getOpenAI(), input);

  const worker = new Worker<AiQueueJob>(
    QUEUE_NAMES.ai,
    async (job) => {
      if (job.name === "ats-scoring") {
        const outcome = await handleScoringJob(job as Job<ScoringJob>, { db, score, analyze });
        console.log(`[worker] ats-scoring ${job.data.aiJobId}: ${outcome.status}`);
        return outcome;
      }
      if (job.name === "generation") {
        const outcome = await handleGenerationJob(job as Job<GenerationJob>, { db, generate, analyze });
        console.log(`[worker] generation ${job.data.aiJobId}: ${outcome.status}${outcome.status === "failed" ? ` (${outcome.reason})` : ""}`);
        return outcome;
      }
      const outcome = await handleJdAnalysisJob(job as Job<JdAnalysisJob>, { db, analyze });
      console.log(`[worker] jd-analysis ${job.data.aiJobId}: ${outcome.status}`);
      return outcome;
    },
    { connection: createRedisConnection(REDIS_URL), concurrency: 4 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] ${job?.name ?? "ai"} ${job?.data.aiJobId} attempt ${job?.attemptsMade} failed:`, err.message);
  });
  worker.on("error", (err) => console.error("[worker] ai worker error:", err.message));
  return worker;
}

// --- PDF export (prd.md §10.3) -------------------------------------------

/** Turns a PDF job into a processPdfExport call. Exported for tests. */
export async function handlePdfJob(job: Pick<Job<PdfJob>, "data">, deps: { db: Database } & PdfProcessDeps) {
  const data = pdfJobSchema.parse(job.data);
  return processPdfExport(deps.db, data, deps);
}

export function createPdfWorker(db: Database): Worker {
  const worker = new Worker<PdfJob>(
    QUEUE_NAMES.pdf,
    async (job) => {
      const outcome = await handlePdfJob(job, {
        db,
        render: renderResumePdf,
        upload: ({ userId, data }) => getStorage().uploadFile({ userId, kind: "pdf", data, extension: "pdf" }),
        deleteFile: (id) => getStorage().deleteFile(id),
      });
      console.log(`[worker] pdf ${job.data.versionId}: ${outcome.status}`);
      return outcome;
    },
    // Each render holds a Chromium tab; a few at a time per instance.
    { connection: createRedisConnection(REDIS_URL), concurrency: 3 },
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] pdf ${job?.data.versionId} attempt ${job?.attemptsMade} failed:`, err.message);
  });
  worker.on("error", (err) => console.error("[worker] pdf worker error:", err.message));
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
  const workers = [
    createTransactionalEmailWorker(db, config),
    createMaintenanceWorker(db),
    createExtractionWorker(db),
    createAiWorker(db),
    createPdfWorker(db),
  ];

  const maintenanceConnection = createRedisConnection(REDIS_URL);
  const maintenanceQueue = createMaintenanceQueue(maintenanceConnection);
  await registerMaintenanceSchedules(maintenanceQueue);
  await maintenanceQueue.close();
  await maintenanceConnection.quit();

  console.log(
    `[worker] listening on queues ${[QUEUE_NAMES.emailTransactional, QUEUE_NAMES.maintenance, QUEUE_NAMES.extraction, QUEUE_NAMES.ai, QUEUE_NAMES.pdf].map((q) => `"${q}"`).join(", ")}`,
  );

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    await (await ocrEngine?.catch(() => undefined))?.terminate();
    await closeBrowser();
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
