import {
  aiJobs,
  auditLogs,
  creditAccounts,
  creditHolds,
  creditLedger,
  payments,
  type Database,
} from "@resume-pilot/database";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Queryable, Tx } from "./db-types";

/**
 * Wallet ledger — prd.md §3.5.
 *
 * `postLedgerEntry` is the only code that writes `credit_ledger` or
 * changes `credit_accounts.balance`. It appends one row with
 * `balance_after` and updates the cached balance in the same
 * transaction, under `SELECT … FOR UPDATE` on the account, so the
 * cached balance always equals the sum of the user's ledger rows
 * (checked by `findWalletMismatches`).
 *
 * The ledger is append-only, enforced by a database trigger
 * (migration 0005): UPDATE, DELETE and TRUNCATE are rejected, except
 * the cascade when a user account is deleted.
 */

export type LedgerEntryType = (typeof creditLedger.$inferInsert)["type"];

/** What each ledger row points at — `(source_type, source_id)` is unique. */
export type LedgerSourceType =
  | "ai_job"
  | "payment"
  | "refund"
  | "code_redemption"
  /** The referrer's side of a referral: same redemption id, separate source so both rows are unique. */
  | "code_redemption_referrer"
  | "admin_adjustment";

export interface LedgerEntryInput {
  userId: string;
  type: LedgerEntryType;
  /** Signed: positive adds credits, negative removes them. */
  credits: number;
  sourceType: LedgerSourceType;
  sourceId: string;
  note?: string;
}

export interface LedgerEntryResult {
  entryId: string;
  credits: number;
  balanceAfter: number;
  /** False when this source was already posted (a retried request or duplicate webhook). */
  created: boolean;
}

export class NegativeBalanceError extends Error {
  constructor(
    readonly balance: number,
    readonly credits: number,
  ) {
    super(`Entry of ${credits} would take balance ${balance} below zero`);
    this.name = "NegativeBalanceError";
  }
}

/** Which entry types may add or remove credits (admin adjustments can do both). */
const DIRECTION: Record<LedgerEntryType, "credit" | "debit" | "either"> = {
  purchase: "credit",
  coupon_credit: "credit",
  referral_credit: "credit",
  capture: "debit",
  refund: "debit",
  admin_adjustment: "either",
};

/**
 * Appends one ledger entry and updates the cached balance. Must run
 * inside a transaction (callers usually already hold one, e.g. capture
 * alongside the hold and job updates).
 *
 * Idempotent on `(sourceType, sourceId)`: posting the same source twice
 * returns the original entry and changes nothing, so a duplicate
 * Razorpay webhook or retried request can never grant or charge twice.
 */
export async function postLedgerEntry(tx: Tx, input: LedgerEntryInput): Promise<LedgerEntryResult> {
  const { userId, type, credits } = input;
  if (!Number.isSafeInteger(credits) || credits === 0) {
    throw new RangeError(`Ledger credits must be a non-zero integer, got ${credits}`);
  }
  const direction = DIRECTION[type];
  if ((direction === "credit" && credits < 0) || (direction === "debit" && credits > 0)) {
    throw new RangeError(`A ${type} entry must be a ${direction}, got ${credits}`);
  }

  const [account] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .for("update");
  if (!account) throw new Error(`No credit account for user ${userId}`);

  const [existing] = await tx
    .select()
    .from(creditLedger)
    .where(
      and(eq(creditLedger.sourceType, input.sourceType), eq(creditLedger.sourceId, input.sourceId)),
    );
  if (existing) {
    if (existing.userId !== userId || existing.type !== type || existing.credits !== credits) {
      throw new Error(
        `Ledger source ${input.sourceType}/${input.sourceId} was already posted with different values`,
      );
    }
    return {
      entryId: existing.id,
      credits: existing.credits,
      balanceAfter: existing.balanceAfter,
      created: false,
    };
  }

  const balanceAfter = account.balance + credits;
  if (balanceAfter < 0) throw new NegativeBalanceError(account.balance, credits);

  const [entry] = await tx
    .insert(creditLedger)
    .values({
      userId,
      type,
      credits,
      balanceAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: input.note,
    })
    .returning();
  if (!entry) throw new Error("credit_ledger insert returned no row");

  await tx
    .update(creditAccounts)
    .set({ balance: balanceAfter, updatedAt: new Date() })
    .where(eq(creditAccounts.id, account.id));

  return { entryId: entry.id, credits, balanceAfter, created: true };
}

/**
 * Grants credits from a purchase, coupon or referral. Callers (M2-04
 * codes, M10 payments) pass their own row id as `sourceId`.
 */
export async function grantCredits(
  db: Database,
  input: Omit<LedgerEntryInput, "type" | "credits"> & {
    type: "purchase" | "coupon_credit" | "referral_credit";
    credits: number;
  },
): Promise<LedgerEntryResult> {
  return db.transaction((tx) => postLedgerEntry(tx, input));
}

/**
 * Admin credit adjustment, either direction (prd.md §2.2). Writes the
 * audit log entry with the reason in the same transaction; the audit
 * row's id is the ledger source, so each adjustment posts exactly once.
 * A removal can't take the balance below zero.
 */
export async function adminAdjustCredits(
  db: Database,
  input: { adminUserId: string; userId: string; credits: number; reason: string },
): Promise<LedgerEntryResult & { auditLogId: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new RangeError("An adjustment needs a reason");

  return db.transaction(async (tx) => {
    const [audit] = await tx
      .insert(auditLogs)
      .values({
        adminUserId: input.adminUserId,
        action: "credits.adjust",
        targetType: "user",
        targetId: input.userId,
        reason,
        metadata: { credits: input.credits },
      })
      .returning({ id: auditLogs.id });
    if (!audit) throw new Error("audit_logs insert returned no row");

    const result = await postLedgerEntry(tx, {
      userId: input.userId,
      type: "admin_adjustment",
      credits: input.credits,
      sourceType: "admin_adjustment",
      sourceId: audit.id,
      note: reason,
    });
    return { ...result, auditLogId: audit.id };
  });
}

export interface WalletMismatch {
  userId: string;
  cachedBalance: number;
  ledgerSum: number;
  /** balance_after of the newest entry; should equal both of the above. */
  lastBalanceAfter: number | null;
}

/**
 * Reconciliation: every wallet whose cached balance differs from the
 * sum of its ledger entries, or from the newest entry's balance_after.
 * Should always return nothing; the worker runs it hourly and logs any
 * hit as an error. Pass `userIds` to check specific wallets.
 */
export async function findWalletMismatches(
  db: Queryable,
  userIds?: readonly string[],
): Promise<WalletMismatch[]> {
  const filter =
    userIds && userIds.length > 0
      ? sql`where a.user_id in (${sql.join(
          userIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``;
  const rows = await db.execute<{
    user_id: string;
    cached_balance: string;
    ledger_sum: string;
    last_balance_after: string | null;
  }>(sql`
    select a.user_id,
           a.balance as cached_balance,
           coalesce(l.total, 0) as ledger_sum,
           last.balance_after as last_balance_after
    from credit_accounts a
    left join (
      select user_id, sum(credits) as total from credit_ledger group by user_id
    ) l on l.user_id = a.user_id
    left join lateral (
      select balance_after from credit_ledger cl
      where cl.user_id = a.user_id
      order by cl.created_at desc, cl.id desc
      limit 1
    ) last on true
    ${filter}
  `);

  return rows
    .map((r) => ({
      userId: r.user_id,
      cachedBalance: Number(r.cached_balance),
      ledgerSum: Number(r.ledger_sum),
      lastBalanceAfter: r.last_balance_after === null ? null : Number(r.last_balance_after),
    }))
    .filter(
      (r) =>
        r.cachedBalance !== r.ledgerSum ||
        (r.lastBalanceAfter !== null && r.lastBalanceAfter !== r.cachedBalance),
    );
}

export interface WalletHistoryEntry {
  id: string;
  type: LedgerEntryType;
  /** For captures: the AI action that was charged (jd_analysis, generation, ats_scoring). */
  action: string | null;
  credits: number;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
  /** What the row links to (§12.1): the version made or scored, the job analysed, or the top-up order. */
  versionId: string | null;
  jdId: string | null;
  orderId: string | null;
}

export interface WalletActiveHold {
  aiJobId: string;
  action: string;
  credits: number;
  expiresAt: Date;
}

export interface WalletPage {
  balance: number;
  held: number;
  available: number;
  activeHolds: WalletActiveHold[];
  history: WalletHistoryEntry[];
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  nextCursor: string | null;
}

/**
 * Everything the wallet page shows (prd.md §3.5): balance, credits on
 * hold with what they're for, and history newest first (action,
 * credits, balance after, date), keyset-paginated.
 */
export async function getWalletPage(
  db: Database,
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
  now: Date = new Date(),
): Promise<WalletPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  // Cursor = id of the last entry seen. Compared as a (created_at, id)
  // row in SQL, so microsecond timestamps never get rounded through JS.
  const cursor = opts.cursor ?? null;
  if (cursor !== null && !/^[0-9a-f-]{36}$/i.test(cursor)) throw new RangeError("Invalid cursor");

  const [account] = await db
    .select({ balance: creditAccounts.balance })
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId));
  const balance = account?.balance ?? 0;

  const activeHolds = await db
    .select({
      aiJobId: creditHolds.aiJobId,
      action: aiJobs.type,
      credits: creditHolds.amount,
      expiresAt: creditHolds.expiresAt,
    })
    .from(creditHolds)
    .innerJoin(aiJobs, eq(aiJobs.id, creditHolds.aiJobId))
    .where(
      and(
        eq(creditHolds.userId, userId),
        eq(creditHolds.status, "active"),
        gt(creditHolds.expiresAt, now),
      ),
    )
    .orderBy(desc(creditHolds.createdAt));
  const held = activeHolds.reduce((sum, h) => sum + h.credits, 0);

  const rows = await db
    .select({
      id: creditLedger.id,
      type: creditLedger.type,
      action: aiJobs.type,
      credits: creditLedger.credits,
      balanceAfter: creditLedger.balanceAfter,
      note: creditLedger.note,
      createdAt: creditLedger.createdAt,
      versionId: sql<string | null>`coalesce(${aiJobs.resultVersionId}::text, ${aiJobs.input} ->> 'versionId')`,
      jdId: sql<string | null>`case when ${aiJobs.type} = 'jd_analysis' then ${aiJobs.input} ->> 'jdId' end`,
      orderId: payments.orderId,
    })
    .from(creditLedger)
    .leftJoin(
      aiJobs,
      and(eq(creditLedger.sourceType, "ai_job"), eq(aiJobs.id, creditLedger.sourceId)),
    )
    .leftJoin(payments, and(eq(creditLedger.sourceType, "payment"), eq(payments.id, creditLedger.sourceId)))
    .where(
      and(
        eq(creditLedger.userId, userId),
        cursor
          ? sql`(${creditLedger.createdAt}, ${creditLedger.id}) < (
              select c.created_at, c.id from credit_ledger c
              where c.id = ${cursor}::uuid and c.user_id = ${userId}::uuid
            )`
          : undefined,
      ),
    )
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    balance,
    held,
    available: Math.max(0, balance - held),
    activeHolds,
    history: page,
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}
