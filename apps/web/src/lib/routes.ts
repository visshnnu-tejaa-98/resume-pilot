/** Public route paths — single source for nav, footer and page links. */
export const routes = {
  home: "/",
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  about: "/about",
  faq: "/faq",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  refunds: "/refunds",
  signIn: "/sign-in",
  signUp: "/sign-up",
  dashboard: "/dashboard",
  welcome: "/welcome",
  // Signed-in app
  resumes: "/resumes",
  upload: "/upload",
  generate: "/generate",
  jobs: "/jobs",
  jobNew: "/jobs/new",
  wallet: "/wallet",
  referrals: "/referrals",
  settings: "/settings",
} as const;

/** Dynamic app routes. */
export const appRoutes = {
  review: (resumeId: string) => `/resumes/${resumeId}/review`,
  job: (jdId: string) => `/jobs/${jdId}`,
  version: (versionId: string) => `/versions/${versionId}`,
  versionPreview: (versionId: string) => `/versions/${versionId}/preview`,
  versionReport: (versionId: string, q: { jd?: string; job?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
    return `/versions/${versionId}/report${qs ? `?${qs}` : ""}`;
  },
  versionCompare: (versionId: string, q: { jd?: string; a?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
    return `/versions/${versionId}/compare${qs ? `?${qs}` : ""}`;
  },
  generation: (jobId: string) => `/generate/${jobId}`,
  paymentResult: (orderId: string) => `/wallet/payments/${orderId}`,
} as const;

export const siteNavLinks = [
  { href: routes.howItWorks, label: "How it works" },
  { href: routes.pricing, label: "Pricing" },
  { href: routes.about, label: "About" },
  { href: routes.faq, label: "FAQ" },
  { href: routes.contact, label: "Contact" },
] as const;

export const footerColumns = [
  {
    title: "Product",
    links: [
      { href: routes.howItWorks, label: "How it works" },
      { href: routes.pricing, label: "Pricing" },
      { href: routes.faq, label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: routes.about, label: "About" },
      { href: routes.contact, label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: routes.privacy, label: "Privacy policy" },
      { href: routes.terms, label: "Terms and conditions" },
      { href: routes.refunds, label: "Refund policy" },
    ],
  },
] as const;

/** Placeholder until the support address is decided (prd §16.4). */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "[SUPPORT EMAIL]";
