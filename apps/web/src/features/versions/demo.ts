import type { AtsReportView, CompareView } from "./types";

/**
 * Sample data copied from the design mockups, served ONLY for the id
 * "demo" and ONLY outside production (see src/server/versions.ts). It
 * lets the ATS report and compare screens be reviewed before scoring (m7) exists.
 */
export const DEMO_ID = "demo";

export const demoReport: AtsReportView = {
  versionId: DEMO_ID,
  title: "Acme Corp · Frontend Engineer",
  subtitle: "Tailored version vs Acme Corp · Frontend Engineer · scored today, 6:14 pm",
  outdated: true,
  jdId: DEMO_ID,
  score: 82,
  band: "Strong match",
  dimensions: [
    { label: "Required keywords", weightPct: 30, value: 26, max: 30 },
    { label: "Skills match", weightPct: 25, value: 21, max: 25 },
    { label: "Experience relevance", weightPct: 20, value: 16, max: 20 },
    { label: "Education and qualifications", weightPct: 10, value: 8, max: 10 },
    { label: "Structure and formatting", weightPct: 15, value: 11, max: 15 },
  ],
  summary:
    "Your React, TypeScript and design-system experience covers most of what Acme asks for. The main gaps are GraphQL and Kubernetes, and CI/CD is only partly shown.",
  matched: [
    { keyword: "React", evidence: "Lead development of Northwind’s React and TypeScript design system…", href: "#" },
    { keyword: "TypeScript", evidence: "Lead development of Northwind’s React and TypeScript design system…", href: "#" },
    { keyword: "Design systems", evidence: "Maintained the shared component library and its documentation.", href: "#" },
    { keyword: "Accessibility", evidence: "Partner with product designers on tokens, theming and accessible components.", href: "#" },
  ],
  matchedTotal: 9,
  missing: [
    { keyword: "CI/CD", priority: "Required", why: "Partial: testing tools are listed, but no pipeline or deployment work is described.", partial: true },
    { keyword: "GraphQL", priority: "Preferred", why: "Not found anywhere in your resume.", partial: false },
    { keyword: "Kubernetes", priority: "Preferred", why: "Not found anywhere in your resume.", partial: false },
  ],
  skillStats: [
    { label: "Required skills matched", value: "7 / 9", sub: "1 partial, 1 missing" },
    { label: "Preferred skills matched", value: "2 / 5", sub: "GraphQL and Kubernetes missing" },
    { label: "Experience", value: "5 yrs", sub: "Job asks for 4+" },
  ],
  recommendations: [
    { title: "Show your CI/CD work", body: "If you set up or maintained pipelines at Globex or Northwind, add a bullet that says so." },
    { title: "Lead with the design system", body: "Move your design-system bullet to the top of Northwind; it’s Acme’s main requirement." },
    { title: "Add the month to your Globex start date", body: "Exact dates parse more reliably in ATS systems." },
    { title: "Keep it to one page", body: "You’re at one page now. Avoid adding more than two bullets per role." },
  ],
  history: [
    { when: "Today, 6:14 pm", note: "Tailored version, before your edits", score: 82 },
    { when: "Today, 6:13 pm", note: "Original resume, same job", score: 61 },
  ],
};

export const demoCompare: CompareView = {
  versionId: DEMO_ID,
  aVersionId: DEMO_ID,
  jdId: DEMO_ID,
  a: { label: "Asha Rao · Original", score: 61 },
  b: { label: "Acme Corp · Frontend Engineer", score: 82 },
  jobLabel: "Acme Corp · Frontend Engineer",
  free: true,
  rows: [
    { label: "Required keywords", a: 17, b: 26, max: 30 },
    { label: "Skills match", a: 16, b: 21, max: 25 },
    { label: "Experience relevance", a: 12, b: 16, max: 20 },
    { label: "Education and qualifications", a: 8, b: 8, max: 10 },
    { label: "Structure and formatting", a: 8, b: 11, max: 15 },
  ],
  gained: ["Design systems", "Accessibility", "Component library", "Theming", "Performance"],
  stillMissing: [
    { keyword: "GraphQL", partial: false },
    { keyword: "Kubernetes", partial: false },
    { keyword: "CI/CD", partial: true },
  ],
  bulletDiff: {
    original: "Worked on the company's UI component library in React.",
    tailored: "Lead development of Northwind's React and TypeScript design system, used across all customer-facing web apps.",
  },
};
