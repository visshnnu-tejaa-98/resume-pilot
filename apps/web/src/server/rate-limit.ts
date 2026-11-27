import { createRedisConnection } from "@resume-pilot/queue";

/**
 * Per-IP limits for public (unauthenticated) endpoints — prd.md §15.
 * Fixed one-minute windows counted in Redis, so every web instance shares
 * the count; falls back to an in-process counter if Redis is unreachable
 * (a limiter must never take the site down).
 *
 * Webhooks aren't limited here: they're authenticated by signature, and
 * Clerk/Razorpay retry in bursts from shared IPs.
 */

export interface RateStore {
  /** Increments the counter for `key` and returns the new count within the window. */
  hit(key: string, windowMs: number): Promise<number>;
}

export function memoryStore(now: () => number = Date.now): RateStore {
  const counts = new Map<string, { n: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const t = now();
      const cur = counts.get(key);
      if (!cur || cur.resetAt <= t) {
        counts.set(key, { n: 1, resetAt: t + windowMs });
        if (counts.size > 50_000) for (const [k, v] of counts) if (v.resetAt <= t) counts.delete(k);
        return 1;
      }
      cur.n += 1;
      return cur.n;
    },
  };
}

function redisStore(fallback: RateStore): RateStore {
  let redis: ReturnType<typeof createRedisConnection> | null = null;
  return {
    async hit(key, windowMs) {
      try {
        redis ??= createRedisConnection();
        const k = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
        const [[, n]] = (await redis.multi().incr(k).pexpire(k, windowMs).exec()) as [[unknown, number], unknown];
        return n;
      } catch {
        return fallback.hit(key, windowMs);
      }
    },
  };
}

let defaultStore: RateStore | null = null;
const store = () => (defaultStore ??= process.env.REDIS_URL ? redisStore(memoryStore()) : memoryStore());

export const PUBLIC_LIMITS = {
  /** tRPC calls made without a signed-in user (health, ping). */
  trpcPublic: { limit: 60, windowMs: 60_000 },
  /** One-click unsubscribe links. */
  unsubscribe: { limit: 30, windowMs: 60_000 },
} as const;

/** First hop of X-Forwarded-For (Railway's edge sets it), else X-Real-IP. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || null;
}

/** null when allowed; otherwise a 429 response with Retry-After. */
export async function limitByIp(req: Request, bucket: keyof typeof PUBLIC_LIMITS, rateStore: RateStore = store()): Promise<Response | null> {
  const { limit, windowMs } = PUBLIC_LIMITS[bucket];
  const ip = clientIp(req) ?? "unknown";
  const n = await rateStore.hit(`${bucket}:${ip}`, windowMs);
  if (n <= limit) return null;
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down and try again in a minute." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(Math.ceil(windowMs / 1000)) },
  });
}
