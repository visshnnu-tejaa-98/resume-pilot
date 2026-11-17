import { promises as dns } from "node:dns";

/**
 * Sending-domain checks for the admin Email page — prd.md §13.7.
 * Plain DNS lookups (no provider API), so they work with any SMTP provider.
 *
 * - SPF: a `v=spf1` TXT record on the From domain.
 * - DKIM: a TXT (`v=DKIM1` / `p=`) or CNAME at `<selector>._domainkey.<domain>`;
 *   the selector is provider-specific, so it comes from EMAIL_DKIM_SELECTOR.
 * - DMARC: a `v=DMARC1` TXT at `_dmarc.<domain>`, also checked on the parent
 *   domain (DMARC falls back to the organisational domain for subdomains).
 */

export type DnsStatus = "verified" | "missing" | "not_configured" | "error";
export interface DnsCheck {
  name: "SPF" | "DKIM" | "DMARC";
  status: DnsStatus;
  host: string;
  detail: string;
}

export interface DnsResolver {
  resolveTxt(host: string): Promise<string[][]>;
  resolveCname(host: string): Promise<string[]>;
}

const notFound = (err: unknown) => ["ENOTFOUND", "ENODATA"].includes((err as { code?: string }).code ?? "");

async function txt(r: DnsResolver, host: string): Promise<string[] | null> {
  try {
    return (await r.resolveTxt(host)).map((parts) => parts.join(""));
  } catch (err) {
    if (notFound(err)) return [];
    return null;
  }
}

export function sendingDomain(fromAddress: string | undefined): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec(fromAddress ?? "");
  return m ? m[1]!.toLowerCase() : null;
}

export async function checkSendingDomain(
  input: { fromAddress?: string; dkimSelector?: string },
  r: DnsResolver = dns,
): Promise<{ domain: string | null; checks: DnsCheck[] }> {
  const domain = sendingDomain(input.fromAddress);
  if (!domain) {
    const nc = (name: DnsCheck["name"]): DnsCheck => ({ name, status: "not_configured", host: "—", detail: "Set EMAIL_FROM_ADDRESS" });
    return { domain, checks: [nc("SPF"), nc("DKIM"), nc("DMARC")] };
  }

  const spfRecs = await txt(r, domain);
  const spf = spfRecs?.find((t) => t.toLowerCase().startsWith("v=spf1"));
  const spfCheck: DnsCheck = { name: "SPF", host: domain, status: spfRecs === null ? "error" : spf ? "verified" : "missing", detail: spf ?? (spfRecs === null ? "DNS lookup failed" : "No v=spf1 TXT record") };

  let dkimCheck: DnsCheck;
  const selector = input.dkimSelector?.trim();
  if (!selector) {
    dkimCheck = { name: "DKIM", host: `<selector>._domainkey.${domain}`, status: "not_configured", detail: "Set EMAIL_DKIM_SELECTOR to the provider's selector" };
  } else {
    const host = `${selector}._domainkey.${domain}`;
    const recs = await txt(r, host);
    const key = recs?.find((t) => /v=DKIM1|(^|;)\s*p=/i.test(t));
    let cname: string | undefined;
    if (!key) cname = await r.resolveCname(host).then((c) => c[0]).catch(() => undefined);
    dkimCheck = { name: "DKIM", host, status: key || cname ? "verified" : recs === null ? "error" : "missing", detail: key ? "DKIM key published" : cname ? `CNAME → ${cname}` : "No DKIM record at this selector" };
  }

  const parent = domain.split(".").slice(-2).join(".");
  let dmarc: string | undefined;
  let dmarcHost = `_dmarc.${domain}`;
  for (const d of parent === domain ? [domain] : [domain, parent]) {
    const recs = await txt(r, `_dmarc.${d}`);
    dmarc = recs?.find((t) => t.toUpperCase().startsWith("V=DMARC1"));
    if (dmarc) {
      dmarcHost = `_dmarc.${d}`;
      break;
    }
  }
  const dmarcCheck: DnsCheck = { name: "DMARC", host: dmarcHost, status: dmarc ? "verified" : "missing", detail: dmarc ?? "No v=DMARC1 TXT record" };

  return { domain, checks: [spfCheck, dkimCheck, dmarcCheck] };
}
