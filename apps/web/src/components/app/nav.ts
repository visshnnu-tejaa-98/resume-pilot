import { routes } from "@/lib/routes";

export interface AppNavItem {
  id: string;
  label: string;
  href: string;
  /** 24×24 stroke path from design/screens/AppSide.dc.html */
  d: string;
  /** Extra path prefixes that also mark this item active. */
  match?: string[];
}

export const workspaceNav: AppNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: routes.dashboard, d: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" },
  { id: "resumes", label: "My resumes", href: routes.resumes, d: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", match: ["/resumes", "/versions"] },
  { id: "upload", label: "Upload resume", href: routes.upload, d: "M12 16V4M6 10l6-6 6 6M4 16v4h16v-4" },
  { id: "generate", label: "Generate", href: routes.generate, d: "M3 11.5 21 4l-7 17-3-7-8-2.5z" },
  { id: "jobs", label: "Job descriptions", href: routes.jobs, d: "M4 8h16v11H4zM9 8V5h6v3M4 13h16" },
  { id: "ats", label: "ATS score", href: routes.ats, d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
];

export const accountNav: AppNavItem[] = [
  { id: "wallet", label: "Wallet", href: routes.wallet, d: "M3 7h18v13H3zM16 13.5h2M5 7l11-3 1 3" },
  {
    id: "referrals",
    label: "Referrals",
    href: routes.referrals,
    d: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.7-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M21 20c0-2.5-1.5-4.2-4-4.8",
  },
  {
    id: "settings",
    label: "Settings",
    href: routes.settings,
    d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  },
];

export function isActive(item: AppNavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Full-width editing screens: sidebar collapses to the drawer on every size. */
const FOCUS_ROUTE = /^\/versions\/[^/]+(\/preview)?$/;
export const isFocusRoute = (pathname: string) => FOCUS_ROUTE.test(pathname);
