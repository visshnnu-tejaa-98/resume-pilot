/**
 * Absolute URLs and contact details every email needs (footer, CTAs).
 * Built once per send from the app's base URL so no template hardcodes
 * a domain. Sender/support values come from config (prd.md §16.4: the
 * sender domain is an open decision).
 */
export interface EmailLinks {
  appUrl: string;
  dashboardUrl: string;
  uploadUrl: string;
  generateUrl: string;
  walletUrl: string;
  referralsUrl: string;
  helpUrl: string;
  privacyUrl: string;
  preferencesUrl: string;
  supportEmail: string;
  /** Registered postal address, required in marketing mail. */
  address: string;
  /** Absolute https URL of a PNG logo. Email clients block SVG / data: URIs. */
  logoUrl?: string;
}

export function buildEmailLinks(
  appUrl: string,
  opts: { supportEmail?: string; address?: string; logoUrl?: string } = {},
): EmailLinks {
  const base = appUrl.replace(/\/$/, "");
  return {
    appUrl: base,
    dashboardUrl: `${base}/dashboard`,
    uploadUrl: `${base}/upload`,
    generateUrl: `${base}/generate`,
    walletUrl: `${base}/wallet`,
    referralsUrl: `${base}/referrals`,
    helpUrl: `${base}/faq`,
    privacyUrl: `${base}/privacy`,
    preferencesUrl: `${base}/settings?tab=prefs`,
    supportEmail: opts.supportEmail ?? "[SUPPORT EMAIL]",
    address: opts.address ?? "[REGISTERED ADDRESS] · India",
    logoUrl: opts.logoUrl,
  };
}

/** Used by previews and tests only. */
export const PREVIEW_LINKS = buildEmailLinks("https://app.resumepilot.app", { supportEmail: "support@resumepilot.app" });
