import "server-only";
import { getGenerationStatus, getVersion, type GenerationMeta } from "@resume-pilot/services";
import type { Provenance } from "@resume-pilot/validators/resume";
import { DEMO_ID, demoCompare, demoReport } from "@/features/versions/demo";
import type { AtsReportView, CompareView, GenerationView, VersionView } from "@/features/versions/types";
import { getDb } from "@/server/db";

/**
 * Loaders for the version screens. Every one is scoped to `userId`
 * (multi-tenancy) and returns null for anything the user doesn't own,
 * so pages 404 instead of leaking existence.
 */

const demoAllowed = () => process.env.NODE_ENV !== "production";
const isDemo = (id: string) => id === DEMO_ID && demoAllowed();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadVersion(userId: string, versionId: string): Promise<VersionView | null> {
  if (!UUID.test(versionId)) return null;
  const db = getDb();
  const v = await getVersion(db, { userId, versionId }).catch(() => null);
  if (!v) return null;

  const provenance = (v.provenance ?? {}) as Provenance;
  const meta = (v.generationMeta ?? {}) as GenerationMeta;

  // "Show original": source bullet text for each AI bullet, from the parent snapshot.
  const sourceBulletTexts: Record<string, string> = {};
  let sourceLabel = "Original upload";
  if (v.parentVersionId) {
    const parent = await getVersion(db, { userId, versionId: v.parentVersionId }).catch(() => null);
    if (parent) {
      sourceLabel = parent.kind === "original" ? `${parent.fileName} · Original` : [parent.companyName, parent.jobTitle].filter(Boolean).join(" · ") || "Earlier version";
      const textById = new Map(
        [...parent.content.workExperience, ...parent.content.projects, ...parent.content.education].flatMap((x) => x.bullets.map((b) => [b.id, b.text] as const)),
      );
      for (const [key, p] of Object.entries(provenance)) {
        const bulletId = key.slice(key.indexOf("[") + 1, -1);
        const texts = p.sourceBulletIds.map((id) => textById.get(id)).filter(Boolean);
        if (texts.length && p.changeType !== "unchanged") sourceBulletTexts[bulletId] = texts.join(" / ");
      }
    }
  }

  return {
    id: v.id,
    kind: v.kind,
    company: v.companyName ?? (v.kind === "original" ? v.fileName : "Tailored resume"),
    role: v.jobTitle ?? (v.kind === "original" ? "Original" : ""),
    sourceLabel,
    template: "Classic",
    savedAt: v.updatedAt,
    content: v.content,
    provenance,
    sourceBulletTexts,
    gaps: meta.gaps ?? [],
    score: v.score === null ? null : { value: v.score, outdated: v.scoreOutdated },
    fileName: `${[v.content.personalInfo.firstName, v.content.personalInfo.lastName, v.jobTitle].filter(Boolean).join("-").replace(/\s+/g, "-") || "resume"}.pdf`,
  };
}

/** Progress page view of a generation job (prd.md §8.1). */
export async function loadGeneration(userId: string, jobId: string): Promise<GenerationView | null> {
  if (!UUID.test(jobId)) return null;
  const s = await getGenerationStatus(getDb(), { userId, aiJobId: jobId });
  if (!s) return null;

  const status = s.status === "succeeded" ? "done" : s.status === "failed" ? "failed" : "running";
  // Steps: 0 analyse · 1 match · 2 tailor · 3 fact check · 4 save.
  const analysing = s.analysis === "pending" || s.analysis === "running";
  const currentStep = status === "done" ? 5 : status === "failed" ? (s.analysis === "failed" ? 0 : 3) : analysing ? 0 : s.status === "running" ? 2 : 1;
  const secs = Math.max(0, Math.round((+new Date(s.updatedAt) - +new Date(s.createdAt)) / 1000));

  return {
    jobId: s.aiJobId,
    label: s.label,
    status,
    elapsed: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
    currentStep,
    stepTimes: ["", "", "", "", ""],
    heldCredits: s.creditsHeld,
    usedCredits: s.creditsCharged,
    versionId: s.versionId,
    error: s.error,
  };
}

export async function loadAtsReport(_userId: string, versionId: string): Promise<AtsReportView | null> {
  if (isDemo(versionId)) return demoReport;
  return null; // TODO(m7-ats-scoring)
}

export async function loadCompare(_userId: string, versionId: string): Promise<CompareView | null> {
  if (isDemo(versionId)) return demoCompare;
  return null; // TODO(m7-ats-scoring)
}
