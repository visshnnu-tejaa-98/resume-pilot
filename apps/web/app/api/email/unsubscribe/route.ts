import { applyUnsubscribe, setEmailPreferences, verifyUnsubscribeToken } from "@resume-pilot/services";
import { getDb } from "@/server/db";

/**
 * Unsubscribe without signing in — prd.md §13.5.
 *
 * - RFC 8058 one-click: mail clients POST `List-Unsubscribe=One-Click`
 *   to the List-Unsubscribe URL (`?t=<signed token>`). Must answer 200.
 * - The unsubscribe page POSTs JSON `{ t, reminders, productUpdates }`
 *   to turn single categories back on or off.
 * The token is HMAC-signed for one user, so it can't touch anyone else.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { t?: unknown; reminders?: unknown; productUpdates?: unknown } | null;
    const t = typeof body?.t === "string" ? verifyUnsubscribeToken(body.t) : null;
    if (!t) return Response.json({ error: "This link is invalid." }, { status: 400 });
    const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
    const prefs = await setEmailPreferences(getDb(), { userId: t.userId, source: "unsubscribe_page", reminders: bool(body?.reminders), productUpdates: bool(body?.productUpdates) });
    return Response.json({ reminders: prefs.reminders, productUpdates: prefs.productUpdates });
  }

  const token = url.searchParams.get("t") ?? "";
  const done = await applyUnsubscribe(getDb(), token);
  if (!done) return new Response("Invalid unsubscribe link", { status: 400 });
  return new Response("Unsubscribed", { status: 200 });
}
