import {
  calculateCredits,
  estimateCredits,
  type CreditEstimate,
  type TokenUsage,
} from "@resume-pilot/credits";
import { aiJobs, creditAccounts, creditHolds, type Database } from "@resume-pilot/database";
import type { PaidAction } from "@resume-pilot/validators";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Queryable, Tx } from "./db-types";
import { postLedgerEntry } from "./ledger";
import { getActivePricingConfig, getPricingConfigByVersion } from "./pricing";

/**
 * Estimate → hold → capture — prd.md §3.4.
 *
 * Every operation that reads or changes what a user can spend runs in
 * one transaction holding `SELECT … FOR UPDATE` on the user's
 * `credit_accounts` row. That lock is what serialises concurrent
 * requests: 20 parallel holds on one wallet run one after another, each
 * seeing the holds the previous ones created, so they can never
 * overspend (acceptance 16.2.5).
 *
 * Holds don't move the balance; they reserve part of it:
 *   available = balance − sum(active, unexpired holds)
 * Only capture moves the balance, with exactly one ledger debit.
 */

export const HOLD_TTL_MS = 15 * 60 * 1000;

/** prd.md §15: paid AI actions (JD analysis, generation, ATS scoring) per user per minute. */
export const AI_ACTIONS_PER_MINUTE = 10;

export class AiRateLimitError extends Error {
  constructor(readonly limit = AI_ACTIONS_PER_MINUTE) {
    super(`Too many AI actions: at most ${limit} a minute`);
    this.name = "AiRateLimitError";
  }
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Insufficient credits: need ${required}, available ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(readonly idempotencyKey: string) {
    super(`Idempotency key ${idempotencyKey} was already used for a different request`);
    this.name = "IdempotencyConflictError";
  }
}

export class HoldNotActiveError extends Error {
  constructor(
    readonly aiJobId: string,
    readonly status: string,
  ) {
    super(`Hold for AI job ${aiJobId} is ${status}, not active`);
    this.name = "HoldNotActiveError";
  }
}

export interface HoldResult {
  aiJobId: string;
  holdId: string;
  credits: number;
  expiresAt: Date;
  /** False when an earlier request with the same idempotency key already placed this hold. */
  created: boolean;
}

export interface CaptureResult {
  aiJobId: string;
  creditsCharged: number;
  /** What the usage actually cost; above `creditsCharged` only when the estimate capped it. */
  creditsActual: number;
  creditsReleased: number;
  balanceAfter: number;
  /** False when the hold was already captured (a retried capture). */
  captured: boolean;
}

async function lockAccount(tx: Tx, userId: string) {
  const [account] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .for("update");
  if (!account) throw new Error(`No credit account for user ${userId}`);
  return account;
}

async function heldCredits(tx: Queryable, userId: string, now: Date): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${creditHolds.amount}), 0)` })
    .from(creditHolds)
    .where(
      and(
        eq(creditHolds.userId, userId),
        eq(creditHolds.status, "active"),
        gt(creditHolds.expiresAt, now),
      ),
    );
  return Number(row?.total ?? 0);
}

export interface WalletBalance {
  balance: number;
  held: number;
  available: number;
}

/** Balance, credits on hold, and what's spendable — what the UI shows (prd.md §3.5). */
export async function getWalletBalance(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<WalletBalance> {
  const [account] = await db
    .select({ balance: creditAccounts.balance })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId));
  const balance = account?.balance ?? 0;
  const held = await heldCredits(db, userId, now);
  return { balance, held, available: Math.max(0, balance - held) };
}

/**
 * Step 1: the estimate shown before the user confirms ("This will use
 * up to N credits"). Read-only; uses the active pricing config.
 */
export async function estimateAction(
  db: Database,
  action: PaidAction,
  inputParts: readonly string[],
): Promise<CreditEstimate> {
  return estimateCredits(await getActivePricingConfig(db), action, inputParts);
}

/**
 * Step 3: on confirm, atomically check available balance and reserve
 * the estimate. Creates the `ai_jobs` row (status pending) and its
 * hold. The estimate passed in is the one shown to the user; its
 * pricing version is recorded so capture prices under the same config.
 *
 * Idempotent on `idempotencyKey`: a retried request or double click
 * returns the existing hold instead of creating a second one.
 */
export async function placeHold(
  db: Database,
  input: { userId: string; idempotencyKey: string; estimate: CreditEstimate },
  now: Date = new Date(),
): Promise<HoldResult> {
  const { userId, idempotencyKey, estimate } = input;
  if (!Number.isInteger(estimate.credits) || estimate.credits <= 0) {
    throw new RangeError(`Hold amount must be a positive integer, got ${estimate.credits}`);
  }

  return db.transaction(async (tx) => {
    // Lock first, then check the key: a concurrent duplicate waits here
    // and then sees the first request's committed job.
    const account = await lockAccount(tx, userId);

    const [existingJob] = await tx
      .select()
      .from(aiJobs)
      .where(eq(aiJobs.idempotencyKey, idempotencyKey));
    if (existingJob) {
      if (existingJob.userId !== userId || existingJob.type !== estimate.action) {
        throw new IdempotencyConflictError(idempotencyKey);
      }
      const [hold] = await tx
        .select()
        .from(creditHolds)
        .where(eq(creditHolds.aiJobId, existingJob.id));
      if (!hold) throw new Error(`AI job ${existingJob.id} has no hold`);
      return {
        aiJobId: existingJob.id,
        holdId: hold.id,
        credits: hold.amount,
        expiresAt: hold.expiresAt,
        created: false,
      };
    }

    // Under the account lock, so parallel requests can't all slip under the limit.
    // A retried request with the same key returned above and isn't counted twice.
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), gt(aiJobs.createdAt, new Date(now.getTime() - 60_000))));
    if ((recent?.n ?? 0) >= AI_ACTIONS_PER_MINUTE) throw new AiRateLimitError();

    const available = account.balance - (await heldCredits(tx, userId, now));
    if (available < estimate.credits) {
      throw new InsufficientCreditsError(estimate.credits, Math.max(0, available));
    }

    const [job] = await tx
      .insert(aiJobs)
      .values({
        userId,
        type: estimate.action,
        status: "pending",
        model: estimate.model,
        creditsEstimated: estimate.credits,
        pricingConfigVersion: estimate.pricingConfigVersion,
        idempotencyKey,
      })
      .returning();
    if (!job) throw new Error("ai_jobs insert returned no row");

    const expiresAt = new Date(now.getTime() + HOLD_TTL_MS);
    const [hold] = await tx
      .insert(creditHolds)
      .values({ userId, aiJobId: job.id, amount: estimate.credits, status: "active", expiresAt })
      .returning();
    if (!hold) throw new Error("credit_holds insert returned no row");

    return { aiJobId: job.id, holdId: hold.id, credits: hold.amount, expiresAt, created: true };
  });
}

/** Loads the hold for a job, locking the account first (same lock order as placeHold). */
async function lockHoldForJob(tx: Tx, aiJobId: string) {
  const [job] = await tx.select().from(aiJobs).where(eq(aiJobs.id, aiJobId));
  if (!job) throw new Error(`AI job ${aiJobId} not found`);
  const account = await lockAccount(tx, job.userId);
  const [hold] = await tx
    .select()
    .from(creditHolds)
    .where(eq(creditHolds.aiJobId, aiJobId))
    .for("update");
  if (!hold) throw new Error(`AI job ${aiJobId} has no hold`);
  return { job, account, hold };
}

/**
 * Step 5: on success (output validated and saved), charge the actual
 * usage, capped at the hold, and release the rest. One ledger debit,
 * cached balance updated in the same transaction.
 *
 * Priced under the job's recorded pricing version, not whatever is
 * active now, so an admin changing markup mid-job can't raise the
 * charge. Retrying a capture returns the original result.
 */
export async function captureHold(
  db: Database,
  input: { aiJobId: string; usage: TokenUsage },
  now: Date = new Date(),
): Promise<CaptureResult> {
  const result = await db.transaction(async (tx): Promise<CaptureResult | "expired"> => {
    const { job, account, hold } = await lockHoldForJob(tx, input.aiJobId);

    if (hold.status === "captured") {
      const charged = job.creditsCharged ?? 0;
      return {
        aiJobId: job.id,
        creditsCharged: charged,
        creditsActual: charged,
        creditsReleased: hold.amount - charged,
        balanceAfter: account.balance,
        captured: false,
      };
    }
    if (hold.status !== "active") throw new HoldNotActiveError(job.id, hold.status);
    if (hold.expiresAt <= now) {
      // Past the safety net: never charge for it. Returned, not thrown,
      // so the release commits; the error is raised after the transaction.
      await releaseLocked(tx, job.id, "hold expired before capture", now);
      return "expired";
    }

    const config = await getPricingConfigByVersion(tx, job.pricingConfigVersion);
    if (!config) throw new Error(`pricing_config v${job.pricingConfigVersion} not found`);
    if (!job.model) throw new Error(`AI job ${job.id} has no model`);

    const actual = calculateCredits(config, job.model, input.usage);
    // Never charge more than the estimate shown to the user (16.2.4).
    const charged = Math.min(actual.credits, hold.amount);

    // Zero is possible only with a 0 minimum and negligible usage; there's
    // nothing to post then, and the ledger rejects zero entries.
    const balanceAfter =
      charged > 0
        ? (
            await postLedgerEntry(tx, {
              userId: job.userId,
              type: "capture",
              credits: -charged,
              sourceType: "ai_job",
              sourceId: job.id,
              note: `${job.type}: ${charged} of ${hold.amount} held`,
            })
          ).balanceAfter
        : account.balance;

    await tx
      .update(creditHolds)
      .set({ status: "captured", updatedAt: now })
      .where(eq(creditHolds.id, hold.id));
    await tx
      .update(aiJobs)
      .set({
        status: "succeeded",
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        costPaise: actual.costPaise,
        creditsCharged: charged,
        updatedAt: now,
      })
      .where(eq(aiJobs.id, job.id));

    return {
      aiJobId: job.id,
      creditsCharged: charged,
      creditsActual: actual.credits,
      creditsReleased: hold.amount - charged,
      balanceAfter,
      captured: true,
    };
  });

  if (result === "expired") throw new HoldNotActiveError(input.aiJobId, "expired");
  return result;
}

async function releaseLocked(tx: Tx, aiJobId: string, reason: string, now: Date) {
  await tx
    .update(creditHolds)
    .set({ status: "released", updatedAt: now })
    .where(and(eq(creditHolds.aiJobId, aiJobId), eq(creditHolds.status, "active")));
  await tx
    .update(aiJobs)
    .set({ status: "failed", error: reason.slice(0, 1000), creditsCharged: 0, updatedAt: now })
    .where(and(eq(aiJobs.id, aiJobId), inArray(aiJobs.status, ["pending", "running"])));
}

/**
 * Step 6: on failure, timeout or validation error, release the hold in
 * full; the job is marked failed and charges 0 (16.2.4). Idempotent:
 * releasing an already-released hold does nothing, and a captured hold
 * is never released.
 */
export async function releaseHold(
  db: Database,
  input: { aiJobId: string; reason: string },
  now: Date = new Date(),
): Promise<{ released: boolean }> {
  return db.transaction(async (tx) => {
    const { job, hold } = await lockHoldForJob(tx, input.aiJobId);
    if (hold.status !== "active") return { released: false };
    await releaseLocked(tx, job.id, input.reason, now);
    return { released: true };
  });
}

/**
 * Safety net (§3.4 step 6): releases every active hold past its
 * expiry. Run every minute by the worker. Expired holds already stop
 * counting against the available balance (see heldCredits), so this
 * only tidies up status and marks the stuck jobs failed.
 */
export async function expireStaleHolds(
  db: Database,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const stale = await db
    .select({ aiJobId: creditHolds.aiJobId })
    .from(creditHolds)
    .where(and(eq(creditHolds.status, "active"), lte(creditHolds.expiresAt, now)));

  let expired = 0;
  for (const { aiJobId } of stale) {
    // Per hold, under the account lock, so it can't race a capture.
    const { released } = await db.transaction(async (tx) => {
      const { job, hold } = await lockHoldForJob(tx, aiJobId);
      if (hold.status !== "active" || hold.expiresAt > now) return { released: false };
      await releaseLocked(tx, job.id, "hold expired (15 min safety net)", now);
      return { released: true };
    });
    if (released) expired++;
  }
  return { expired };
}
