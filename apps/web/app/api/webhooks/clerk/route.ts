import { createUserFromClerkWebhook } from "@resume-pilot/services";
import { clerkClient } from "@clerk/nextjs/server";
import { Webhook, type WebhookRequiredHeaders } from "svix";
import { getDb } from "@/server/db";
import { enqueueWelcomeEmail } from "@/server/welcome";

interface ClerkWebhookEvent {
  type: string;
  data: unknown;
}

interface ClerkUserCreatedData {
  id: string;
  first_name: string | null;
  email_addresses: Array<{ id: string; email_address: string }>;
  primary_email_address_id: string | null;
}

// A plain `type` discriminant doesn't narrow a union by itself when the
// "other events" branch's `type` is just `string` (it overlaps every
// literal), so this checks the payload shape directly instead of
// relying on the union's `type` field to narrow `data`.
function isUserCreatedData(data: unknown): data is ClerkUserCreatedData {
  return typeof data === "object" && data !== null && "id" in data && "email_addresses" in data;
}

function primaryEmail(data: ClerkUserCreatedData): string | undefined {
  const match = data.email_addresses.find((e) => e.id === data.primary_email_address_id);
  return (match ?? data.email_addresses[0])?.email_address;
}

/**
 * Clerk `user.created` webhook — prd.md §4.2,
 * tasks/todo/m1-foundation/04-auth-clerk-integration.md. Signature
 * verified against the raw body (required: svix signs the exact bytes
 * sent, so parsing JSON first and re-serializing would break
 * verification on whitespace/key-order differences).
 */
export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const headers: WebhookRequiredHeaders & Record<string, string> = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  try {
    // `verify` only validates the signature (and returns void) in this
    // svix version — it does not hand back a parsed payload.
    new Webhook(secret).verify(rawBody, headers);
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody) as ClerkWebhookEvent;

  if (event.type !== "user.created" || !isUserCreatedData(event.data)) {
    // Only user.created is handled per this task's scope; other event
    // types (user.updated, session.created, ...) are accepted but
    // ignored rather than erroring, so Clerk doesn't retry them forever.
    return new Response("ignored", { status: 200 });
  }

  const email = primaryEmail(event.data);
  if (!email) {
    console.error("[clerk-webhook] user.created with no email address:", event.data.id);
    return new Response("Missing email", { status: 400 });
  }

  const result = await createUserFromClerkWebhook(getDb(), {
    clerkUserId: event.data.id,
    email,
    firstName: event.data.first_name,
  });

  if (result.created) {
    // Best-effort mirror into Clerk private metadata (prd.md §4.3: role
    // lives in both places). The DB row is the actual source of truth —
    // every tRPC procedure reads it fresh — so a failure here never
    // blocks the webhook from succeeding.
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(event.data.id, {
        privateMetadata: { role: "user" },
      });
    } catch (err) {
      console.error("[clerk-webhook] failed to mirror role into Clerk metadata:", err);
    }
  }

  // Welcome email (prd.md §13.1): enqueued, not sent inline, so SMTP
  // latency never slows the webhook and failed sends retry in the
  // worker. Enqueued on *every* delivery, not just when the user was
  // created: if Redis was down on the first delivery we return 500,
  // Clerk retries, and the retry (created=false) still enqueues. The
  // job id and email_messages.idempotency_key make duplicates no-ops.
  try {
    await enqueueWelcomeEmail(result.userId, event.data.first_name);
  } catch (err) {
    console.error("[clerk-webhook] failed to enqueue welcome email:", err);
    return new Response("Failed to enqueue welcome email", { status: 500 });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
