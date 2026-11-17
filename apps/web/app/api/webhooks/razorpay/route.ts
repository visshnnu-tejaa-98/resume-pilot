import { enqueueTransactionalEmail } from "@resume-pilot/queue";
import { handleRazorpayWebhook, PaymentError, verifyWebhookSignature, type RazorpayWebhookEvent } from "@resume-pilot/services";
import { createHash } from "node:crypto";
import { getDb } from "@/server/db";
import { getTransactionalEmailQueue } from "@/server/queue";

/**
 * Razorpay webhook — prd.md §11.1 step 5, §11.3. Subscribe to
 * payment.captured, payment.failed, refund.processed and refund.failed.
 *
 * - Signature checked on the raw body (HMAC-SHA256, RAZORPAY_WEBHOOK_SECRET).
 * - Idempotent: the grant is keyed on the payment, so duplicate or
 *   concurrent deliveries add credits once; every raw event is stored in
 *   `payment_events` (unique on the event id).
 * - Errors return 5xx so Razorpay retries; a payment we can never match
 *   (unknown order, wrong amount) returns 200 after logging, since a
 *   retry can't fix it.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(secret, rawBody, signature)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  // Razorpay sends a unique id per event (same id on its retries). Fall back to a body hash.
  const eventId = req.headers.get("x-razorpay-event-id") || `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;

  try {
    const outcome = await handleRazorpayWebhook(getDb(), { eventId, event });
    if (outcome.grant?.status === "captured") {
      // Receipt (§13.1 recharge_success): on every delivery, deduped by key, so a failed enqueue is retried next time.
      await enqueueTransactionalEmail(getTransactionalEmailQueue(), { templateKey: "recharge_success", userId: outcome.grant.userId, paymentId: outcome.grant.id });
    }
    if (outcome.failed) {
      // §13.1 recharge_failed; the worker re-checks the payment is still failed before sending.
      await enqueueTransactionalEmail(getTransactionalEmailQueue(), { templateKey: "recharge_failed", userId: outcome.failed.userId, paymentId: outcome.failed.id });
    }
    return Response.json({ handled: outcome.handled, duplicate: outcome.duplicate });
  } catch (err) {
    if (err instanceof PaymentError && (err.code === "not_found" || err.code === "mismatch")) {
      console.error(`[razorpay-webhook] ${event.event} ${eventId}: ${err.message}`);
      return Response.json({ handled: "rejected", reason: err.code });
    }
    console.error(`[razorpay-webhook] ${event.event} ${eventId} failed:`, err);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
