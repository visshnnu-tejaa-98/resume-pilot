import "server-only";
import { DEMO_ID, demoCompare, demoGeneration, demoReport, demoVersion } from "@/features/versions/demo";
import type { AtsReportView, CompareView, GenerationStatus, GenerationView, VersionView } from "@/features/versions/types";

/**
 * Loaders for the tailored-version screens. Every real loader must
 * filter by `userId` (multi-tenancy). Until generation (tasks/todo/m6),
 * scoring (m7) and PDF export (m9) exist they return null, so the pages
 * 404 for real ids. The "demo" id renders design sample data, but never
 * in production.
 */
const demoAllowed = () => process.env.NODE_ENV !== "production";
const isDemo = (id: string) => id === DEMO_ID && demoAllowed();

export async function loadVersion(_userId: string, versionId: string): Promise<VersionView | null> {
  if (isDemo(versionId)) return demoVersion;
  return null; // TODO(m6-generation): read resume_versions (kind=generated) owned by _userId
}

export async function loadAtsReport(_userId: string, versionId: string): Promise<AtsReportView | null> {
  if (isDemo(versionId)) return demoReport;
  return null; // TODO(m7-ats-scoring)
}

export async function loadCompare(_userId: string, versionId: string): Promise<CompareView | null> {
  if (isDemo(versionId)) return demoCompare;
  return null; // TODO(m7-ats-scoring)
}

export async function loadGeneration(
  _userId: string,
  jobId: string,
  demoStatus?: string,
): Promise<GenerationView | null> {
  if (isDemo(jobId)) {
    const s: GenerationStatus = demoStatus === "done" || demoStatus === "failed" ? demoStatus : "running";
    return demoGeneration(s);
  }
  return null; // TODO(m6-generation): read ai_jobs owned by _userId
}
