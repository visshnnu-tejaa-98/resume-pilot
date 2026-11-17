import { createHmac, timingSafeEqual } from "node:crypto";
import { emailPreferences, emailSuppressions, users, type Database } from "@resume-pilot/database";
import { and, eq, sql } from "drizzle-orm";

/**
 * Marketing preferences and one-click unsubscribe — prd.md §13.5.
 *
 * - Consent is opt-in (DPDP Act): no `email_preferences` row = no consent.
 * - Two categories today: reminders (inactive nudge), product updates
 *   (campaigns). Offers is stored but not shown until promo emails ship.
 * - Unsubscribe links carry an HMAC-signed token (user id + category),
 *   so they work without signing in and can't be forged for another user.
 */

export type MarketingCategory = "reminders" | "productUpdates";
export const MARKETING_CATEGORIES: MarketingCategory[] = ["reminders", "productUpdates"];

/** Which preference each marketing template needs. */
export const TEMPLATE_CATEGORY: Record<string, MarketingCategory> = {
  inactive_nudge: "reminders",
  new_features: "productUpdates",
};

export interface EmailPrefs {
  reminders: boolean;
  productUpdates: boolean;
  consentSource: string | null;
  consentAt: Date | null;
}

export async function getEmailPreferences(db: Pick<Database, "select">, userId: string): Promise<EmailPrefs> {
  const [row] = await db.select().from(emailPreferences).where(eq(emailPreferences.userId, userId));
  return { reminders: row?.reminders ?? false, productUpdates: row?.productUpdates ?? false, consentSource: row?.consentSource ?? null, consentAt: row?.consentAt ?? null };
}

/** True once sign-up consent has been processed (a row exists, ticked or not). */
export async function hasEmailPreferencesRow(db: Pick<Database, "select">, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: emailPreferences.id }).from(emailPreferences).where(eq(emailPreferences.userId, userId));
  return !!row;
}

/**
 * Sets one or more categories. Turning any category on records consent
 * (source + time), as the DPDP Act needs proof of it. Turning a category
 * on also lifts a previous "unsubscribe from all" for this address, since
 * the user has just asked for mail again; hard bounces stay.
 */
export async function setEmailPreferences(
  db: Database,
  input: { userId: string; source: "signup" | "settings" | "unsubscribe_page"; reminders?: boolean; productUpdates?: boolean },
  now = new Date(),
): Promise<EmailPrefs> {
  return db.transaction(async (tx) => {
    const cur = await getEmailPreferences(tx, input.userId);
    const next = { reminders: input.reminders ?? cur.reminders, productUpdates: input.productUpdates ?? cur.productUpdates };
    const optingIn = (next.reminders && !cur.reminders) || (next.productUpdates && !cur.productUpdates);
    const consent = optingIn ? { consentSource: input.source, consentAt: now } : {};
    await tx
      .insert(emailPreferences)
      .values({ userId: input.userId, ...next, ...consent, updatedAt: now })
      .onConflictDoUpdate({ target: emailPreferences.userId, set: { ...next, ...consent, updatedAt: now } });
    if (optingIn) {
      const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId));
      if (u) await tx.delete(emailSuppressions).where(and(sql`lower(${emailSuppressions.email}) = lower(${u.email})`, eq(emailSuppressions.reason, "unsubscribe_all")));
    }
    return getEmailPreferences(tx, input.userId);
  });
}

// ─── Unsubscribe tokens ────────────────────────────────────────────────────

export type UnsubscribeScope = MarketingCategory | "all";

function secret(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not set (16+ characters)");
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** `<userId>.<scope>.<sig>` — no expiry: an unsubscribe link must keep working (Gmail/Yahoo bulk-sender rules). */
export function signUnsubscribeToken(userId: string, scope: UnsubscribeScope, key = secret()): string {
  const body = `${userId}.${scope}`;
  return `${body}.${b64(createHmac("sha256", key).update(`unsub:${body}`).digest())}`;
}

export function verifyUnsubscribeToken(token: string, key = secret()): { userId: string; scope: UnsubscribeScope } | null {
  const m = /^([0-9a-f-]{36})\.(reminders|productUpdates|all)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  const expected = createHmac("sha256", key).update(`unsub:${m[1]}.${m[2]}`).digest();
  const given = Buffer.from(m[3]!, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { userId: m[1]!, scope: m[2] as UnsubscribeScope };
}

export function unsubscribeUrl(appUrl: string, userId: string, scope: UnsubscribeScope): string {
  return `${appUrl.replace(/\/$/, "")}/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(userId, scope))}`;
}

/** One-click unsubscribe (link or List-Unsubscribe-Post). Immediate: every marketing send re-checks at send time. */
export async function applyUnsubscribe(db: Database, token: string): Promise<{ userId: string; scope: UnsubscribeScope; prefs: EmailPrefs } | null> {
  const t = verifyUnsubscribeToken(token);
  if (!t) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, t.userId));
  if (!u) return null;
  const off = t.scope === "all" ? { reminders: false, productUpdates: false } : { [t.scope]: false };
  const prefs = await setEmailPreferences(db, { userId: t.userId, source: "unsubscribe_page", ...off });
  return { userId: t.userId, scope: t.scope, prefs };
}
