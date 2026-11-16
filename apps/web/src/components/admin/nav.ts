/** Admin sidebar (design/screens/AdminSide.dc.html). */
export const adminRoutes = {
  overview: "/admin",
  aiJobs: "/admin/ai-jobs",
  aiJob: (id: string) => `/admin/ai-jobs/${id}`,
  users: "/admin/users",
  user: (id: string) => `/admin/users/${id}`,
  coupons: "/admin/coupons",
  emails: "/admin/emails",
  campaign: "/admin/emails/campaign",
  emailLog: "/admin/emails/log",
  ledger: "/admin/ledger",
  payments: "/admin/payments",
  pricing: "/admin/pricing",
  templates: "/admin/templates",
  audit: "/admin/audit",
  settings: "/admin/settings",
} as const;

export type AdminBadgeKey = "aiJobs" | "coupons";

export interface AdminNavItem {
  label: string;
  href: string;
  d: string;
  badge?: AdminBadgeKey;
  /** Match only the exact path (Overview, Email templates). */
  exact?: boolean;
}

export const adminNav: { title: string; items: AdminNavItem[] }[] = [
  {
    title: "Monitor",
    items: [
      { label: "Overview", href: adminRoutes.overview, d: "M4 19h16M7 16V9M12 16V5M17 16v-4", exact: true },
      { label: "AI jobs and logs", href: adminRoutes.aiJobs, d: "M4 6h16v12H4zM8 10l2 2-2 2M12 14h4", badge: "aiJobs" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users", href: adminRoutes.users, d: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.7-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M21 20c0-2.5-1.5-4.2-4-4.8" },
      { label: "Coupons and referrals", href: adminRoutes.coupons, d: "M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 7v12", badge: "coupons" },
    ],
  },
  {
    title: "Engage",
    items: [
      { label: "Email templates", href: adminRoutes.emails, d: "M3 6h18v12H3zM3 7l9 6 9-6", exact: true },
      { label: "Campaigns", href: adminRoutes.campaign, d: "M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6" },
      { label: "Email log", href: adminRoutes.emailLog, d: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Credit ledger", href: adminRoutes.ledger, d: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" },
      { label: "Payments and refunds", href: adminRoutes.payments, d: "M3 6h18v12H3zM3 10h18M7 15h3" },
      { label: "Pricing config", href: adminRoutes.pricing, d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Templates", href: adminRoutes.templates, d: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h4" },
      { label: "Audit log", href: adminRoutes.audit, d: "M12 8v4l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
      {
        label: "App settings",
        href: adminRoutes.settings,
        d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
      },
    ],
  },
];

export function isAdminActive(item: AdminNavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
