import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay REST client + signature checks — prd.md §11. Plain fetch so
 * tests inject a fake; no SDK. Every call is server-side with the key
 * secret; the browser only ever sees the key id.
 */

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Secret set on the webhook in the Razorpay dashboard (different from the key secret). */
  webhookSecret: string;
}

export class RazorpayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayConfigError";
  }
}

export function razorpayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RazorpayConfig {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret || !webhookSecret) {
    throw new RazorpayConfigError("Razorpay is not configured — set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET");
  }
  return { keyId, keySecret, webhookSecret };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method?: string;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  notes?: Record<string, string> | [];
}

export interface RazorpayClient {
  keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  refund(input: { paymentId: string; amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<RazorpayRefund>;
  /** Refunds already made on a payment — a retry checks these first (notes.refund_id) so a lost response can't refund twice. */
  listRefunds(paymentId: string): Promise<RazorpayRefund[]>;
}

export class RazorpayApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

const API = "https://api.razorpay.com/v1";

export function createRazorpayClient(config: Pick<RazorpayConfig, "keyId" | "keySecret">, fetchImpl: typeof fetch = fetch): RazorpayClient {
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: auth, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } };
    if (!res.ok) throw new RazorpayApiError(res.status, json.error?.code, json.error?.description ?? `Razorpay HTTP ${res.status}`);
    return json as T;
  }
  return {
    keyId: config.keyId,
    createOrder: ({ amountPaise, receipt, notes }) => call("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes }),
    fetchPayment: (id) => call("GET", `/payments/${encodeURIComponent(id)}`),
    refund: ({ paymentId, amountPaise, receipt, notes }) =>
      call("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: "normal", receipt, notes }),
    listRefunds: async (id) => (await call<{ items: RazorpayRefund[] }>("GET", `/payments/${encodeURIComponent(id)}/refunds`)).items,
  };
}

function hmacEquals(secret: string, data: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(data).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Checkout success handler: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export function verifyCheckoutSignature(keySecret: string, input: { orderId: string; paymentId: string; signature: string }): boolean {
  return hmacEquals(keySecret, `${input.orderId}|${input.paymentId}`, input.signature);
}

/** Webhook: HMAC-SHA256(raw body, webhook secret) in X-Razorpay-Signature. Must be the exact bytes received. */
export function verifyWebhookSignature(webhookSecret: string, rawBody: string, signature: string): boolean {
  return hmacEquals(webhookSecret, rawBody, signature);
}

let defaultClient: RazorpayClient | undefined;
export function getRazorpay(): RazorpayClient {
  defaultClient ??= createRazorpayClient(razorpayConfigFromEnv());
  return defaultClient;
}
