import { describe, expect, it } from "vitest";
import { clientIp, limitByIp, memoryStore, PUBLIC_LIMITS } from "./rate-limit";

const req = (ip?: string, header = "x-forwarded-for") => new Request("http://x/api/trpc/health", { headers: ip ? { [header]: ip } : {} });

describe("per-IP limits on public endpoints (prd.md §15)", () => {
  it("allows up to the limit, then 429 with Retry-After", async () => {
    const store = memoryStore();
    const { limit } = PUBLIC_LIMITS.trpcPublic;
    for (let i = 0; i < limit; i++) expect(await limitByIp(req("1.2.3.4"), "trpcPublic", store)).toBeNull();
    const res = await limitByIp(req("1.2.3.4"), "trpcPublic", store);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBe("60");
  });

  it("counts each IP separately, and each bucket separately", async () => {
    const store = memoryStore();
    for (let i = 0; i < PUBLIC_LIMITS.trpcPublic.limit; i++) await limitByIp(req("1.1.1.1"), "trpcPublic", store);
    expect(await limitByIp(req("2.2.2.2"), "trpcPublic", store)).toBeNull();
    expect(await limitByIp(req("1.1.1.1"), "unsubscribe", store)).toBeNull();
  });

  it("the window resets after a minute", async () => {
    let t = 0;
    const store = memoryStore(() => t);
    for (let i = 0; i <= PUBLIC_LIMITS.unsubscribe.limit; i++) await limitByIp(req("9.9.9.9"), "unsubscribe", store);
    expect((await limitByIp(req("9.9.9.9"), "unsubscribe", store))?.status).toBe(429);
    t += 60_001;
    expect(await limitByIp(req("9.9.9.9"), "unsubscribe", store)).toBeNull();
  });

  it("uses the first X-Forwarded-For hop, else X-Real-IP; a spoofed later hop doesn't help", () => {
    expect(clientIp(req("5.5.5.5, 6.6.6.6"))).toBe("5.5.5.5");
    expect(clientIp(req("7.7.7.7", "x-real-ip"))).toBe("7.7.7.7");
    expect(clientIp(req())).toBeNull();
  });

  it("requests with no IP share one bucket rather than bypassing the limit", async () => {
    const store = memoryStore();
    for (let i = 0; i < PUBLIC_LIMITS.unsubscribe.limit; i++) await limitByIp(req(), "unsubscribe", store);
    expect((await limitByIp(req(), "unsubscribe", store))?.status).toBe(429);
  });
});
