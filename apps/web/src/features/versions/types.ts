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

export interface EditableBullet {
  id: string;
  text: string;
  origin: BulletOrigin;
  /** The source bullet this was rewritten from (grounding, §8.3). */
  originalText?: string;
}

export interface EditableRole {
  id: string;
  company: string;
  designation: string;
  dates: string;
  bullets: EditableBullet[];
}

export interface VersionView {
  id: string;
  company: string;
  role: string;
  sourceLabel: string;
  template: TemplateName;
  savedAt: Date;
  /** Section ids in order, with visibility. */
  sections: { id: string; label: string; visible: boolean }[];
  work: EditableRole[];
  score: { value: number; outdated: boolean } | null;
  doc: ResumeDoc;
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
  outdated: boolean;
  rescoreEstimate: number;
  score: number;
  band: "Strong match" | "Good match" | "Needs work";
  dimensions: AtsDimension[];
  summary: string;
  matched: { keyword: string; evidence: string }[];
  matchedTotal: number;
  missing: { keyword: string; priority: "Required" | "Preferred"; why: string; partial: boolean }[];
  skillStats: { label: string; value: string; sub: string }[];
  recommendations: { title: string; body: string }[];
  history: { when: string; note: string; score: number }[];
}

export interface CompareView {
  versionId: string;
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
}
