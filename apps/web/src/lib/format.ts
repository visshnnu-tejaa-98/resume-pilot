const IN = "en-IN";

export const fmtCredits = (n: number) => n.toLocaleString(IN);

/** "+500" / "−582" with a real minus sign. */
export const fmtSignedCredits = (n: number) => (n > 0 ? `+${fmtCredits(n)}` : n < 0 ? `−${fmtCredits(-n)}` : "0");

export const fmtInr = (rupees: number) => `₹${rupees.toLocaleString(IN)}`;

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString(IN, { day: "numeric", month: "short", year: "numeric" });

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString(IN, { hour: "numeric", minute: "2-digit" }).toLowerCase();

/** "Today, 6:12 pm" / "Yesterday" / "3 days ago" / "8 Nov 2026" — the designs' style. */
export function fmtRelative(d: Date | string, now: Date = new Date()): string {
  const date = new Date(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return `Today, ${fmtTime(date)}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(date);
}

/** Time-of-day greeting, as on the dashboard. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
