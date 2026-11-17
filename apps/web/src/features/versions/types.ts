import type { Provenance, Resume } from "@resume-pilot/validators/resume";
import type { TemplateName } from "@/stores/preferences-store";

/**
 * View-models for the tailored-version screens (Editor, Preview, ATS
 * report, Compare, generation progress). The UI renders only these
 * shapes; server loaders in src/server/versions.ts map DB rows into them
 * once generation (m6), scoring (m7) and PDF export (m9) exist.
 */

export type BulletOrigin = "ai" | "user" | "original";

export interface DocItem {
  title?: string;
  date?: string;
  lines: string[];
}

export interface DocSection {
  id: string;
  heading: string;
  items: DocItem[];
}

/** A resume laid out for rendering (preview / PDF). */
export interface ResumeDoc {
  name: string;
  contact: string;
  sections: DocSection[];
}

export interface VersionGap {
  requirementId: string | null;
  keyword: string;
  note: string;
}

/** A version as the editor / preview see it (built in src/server/versions.ts). */
export interface VersionView {
  id: string;
  kind: "original" | "generated";
  company: string;
  role: string;
  sourceLabel: string;
  template: TemplateName;
  savedAt: Date;
  content: Resume;
  /** `<itemId>.bullets[<bulletId>]` → how the AI produced it (§8.3). */
  provenance: Provenance;
  /** Bullet id → the source bullet text(s) it came from ("Show original"). */
  sourceBulletTexts: Record<string, string>;
  gaps: VersionGap[];
  score: { value: number; outdated: boolean } | null;
  fileName: string;
}

export interface AtsDimension {
  label: string;
  weightPct: number;
  value: number;
  max: number;
}

export interface AtsReportView {
  versionId: string;
  title: string;
  subtitle: string;
  jdId: string;
  outdated: boolean;
  score: number;
  band: "Strong match" | "Good match" | "Needs work";
  dimensions: AtsDimension[];
  summary: string;
  /** Each keyword links to the resume line that proves it (editor anchor). */
  matched: { keyword: string; evidence: string; href: string }[];
  matchedTotal: number;
  missing: { keyword: string; priority: "Required" | "Preferred"; why: string; partial: boolean }[];
  skillStats: { label: string; value: string; sub: string }[];
  recommendations: { title: string; body: string }[];
  history: { when: string; note: string; score: number }[];
}

export interface CompareView {
  versionId: string;
  aVersionId: string;
  jdId: string;
  a: { label: string; score: number };
  b: { label: string; score: number };
  jobLabel: string;
  free: boolean;
  rows: { label: string; a: number; b: number; max: number }[];
  gained: string[];
  stillMissing: { keyword: string; partial: boolean }[];
  bulletDiff: { original: string; tailored: string };
}

export type GenerationStatus = "running" | "done" | "failed";

export interface GenerationView {
  jobId: string;
  label: string;
  status: GenerationStatus;
  elapsed: string;
  /** Index of the step in progress (or where it failed). */
  currentStep: number;
  stepTimes: string[];
  heldCredits: number;
  usedCredits: number | null;
  versionId: string | null;
  /** Why it failed (shown to the user; grounding counts are admin detail). */
  error?: string | null;
}
