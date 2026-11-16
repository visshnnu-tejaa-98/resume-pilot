import type { AtsReportView, CompareView, GenerationStatus, GenerationView, ResumeDoc, VersionView } from "./types";

/**
 * Sample data copied from the design mockups, served ONLY for the id
 * "demo" and ONLY outside production (see src/server/versions.ts). It
 * lets the version screens be reviewed before generation exists.
 */
export const DEMO_ID = "demo";

const doc: ResumeDoc = {
  name: "Asha Rao",
  contact: "Frontend Engineer · Bengaluru · asha.rao@example.com · linkedin.com/in/asharao",
  sections: [
    {
      id: "summary",
      heading: "Summary",
      items: [{ lines: ["Frontend engineer with 5 years of experience building React and TypeScript design systems and fast, accessible web apps."] }],
    },
    {
      id: "work",
      heading: "Experience",
      items: [
        {
          title: "Frontend Engineer · Northwind",
          date: "Jul 2023 – Present",
          lines: [
            "• Lead development of Northwind’s React and TypeScript design system, used across all customer-facing web apps.",
            "• Partner with product designers on tokens, theming and accessible components.",
            "• Mentor two junior engineers through code reviews and pairing.",
          ],
        },
        {
          title: "Software Engineer · Globex",
          date: "Jan 2021 – Jun 2023",
          lines: [
            "• Built the checkout UI in React, used by every Globex web customer.",
            "• Maintained the shared component library and its documentation.",
            "• Worked with design to roll out a new type scale across the product.",
          ],
        },
      ],
    },
    { id: "projects", heading: "Projects", items: [{ title: "Open-source date picker", date: "2024", lines: ["• Accessible React date picker with keyboard support and TypeScript types."] }] },
    { id: "skills", heading: "Skills", items: [{ lines: ["React · TypeScript · JavaScript · Next.js · HTML · CSS · Storybook · Jest · Playwright · Git · Webpack · Figma"] }] },
    { id: "education", heading: "Education", items: [{ title: "B.Tech, Computer Science · [UNIVERSITY]", date: "2016 – 2020", lines: [] }] },
  ],
};

export const demoVersion: VersionView = {
  id: DEMO_ID,
  company: "Acme Corp",
  role: "Frontend Engineer",
  sourceLabel: "Asha Rao · Original",
  template: "Modern",
  savedAt: new Date(),
  sections: [
    { id: "personal", label: "Personal info", visible: true },
    { id: "summary", label: "Summary", visible: true },
    { id: "work", label: "Work experience", visible: true },
    { id: "skills", label: "Skills", visible: true },
    { id: "projects", label: "Projects", visible: true },
    { id: "education", label: "Education", visible: true },
    { id: "certifications", label: "Certifications", visible: false },
  ],
  work: [
    {
      id: "w1",
      company: "Northwind",
      designation: "Frontend Engineer",
      dates: "Jul 2023 – Present",
      bullets: [
        { id: "b1", origin: "ai", text: "Lead development of Northwind’s React and TypeScript design system, used across all customer-facing web apps.", originalText: "Worked on the company's UI component library in React." },
        { id: "b2", origin: "ai", text: "Partner with product designers on tokens, theming and accessible components.", originalText: "Worked with designers on theming." },
        { id: "b3", origin: "user", text: "Mentor two junior engineers through code reviews and pairing.", originalText: "Mentored junior engineers." },
      ],
    },
  ],
  score: { value: 82, outdated: false },
  doc,
  fileName: "Asha-Rao-Frontend-Engineer.pdf",
};

export const demoReport: AtsReportView = {
  versionId: DEMO_ID,
  title: "Acme Corp · Frontend Engineer",
  subtitle: "Tailored version vs Acme Corp · Frontend Engineer · scored today, 6:14 pm",
  outdated: true,
  rescoreEstimate: 150,
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
    { keyword: "React", evidence: "Lead development of Northwind’s React and TypeScript design system…" },
    { keyword: "TypeScript", evidence: "Lead development of Northwind’s React and TypeScript design system…" },
    { keyword: "Design systems", evidence: "Maintained the shared component library and its documentation." },
    { keyword: "Accessibility", evidence: "Partner with product designers on tokens, theming and accessible components." },
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

export function demoGeneration(status: GenerationStatus): GenerationView {
  return {
    jobId: DEMO_ID,
    label: "Umbrella Health · Frontend Developer · from your original",
    status,
    elapsed: "0:48",
    currentStep: status === "done" ? 5 : status === "failed" ? 3 : 2,
    stepTimes: ["0:06", "0:09", "0:21", "0:08", "0:04"],
    heldCredits: 640,
    usedCredits: status === "done" ? 591 : null,
    versionId: status === "done" ? DEMO_ID : null,
  };
}
