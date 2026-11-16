/** Formatting helpers for admin screens. */

export const fmtPaise = (paise: number, decimals = 0) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

/** Indian-style compact: 2.06L, 1.2Cr; credits: 3.1M / 554k. */
export function fmtCompactInr(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  return `₹${Math.round(r).toLocaleString("en-IN")}`;
}

export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}k`;
  return n.toLocaleString("en-IN");
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** First 8 chars of a uuid, for compact id columns. */
export const shortId = (id: string, prefix = "") => `${prefix}${id.slice(0, 8)}`;

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const pct = (part: number, whole: number, digits = 1) => (whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : "0%");

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

const AI_TYPE: Record<string, string> = { jd_analysis: "JD analysis", generation: "Generation", ats_scoring: "ATS score" };
export const aiTypeLabel = (t: string) => AI_TYPE[t] ?? t;
