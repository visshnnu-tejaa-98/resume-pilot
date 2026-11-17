"use server";

import { SCORING_METHOD_VERSION } from "@resume-pilot/ai";
import { estimateGeneration, estimateScoring } from "@resume-pilot/services";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

const inputSchema = z.object({
  versionId: z.uuid(),
  jdId: z.uuid(),
  mode: z.enum(["tailor", "score"]),
});

export interface EstimateLine {
  label: string;
  credits: number;
}

export type EstimateResult = { ok: true; lines: EstimateLine[]; total: number; cachedReportId?: string } | { ok: false; message: string };

const LABELS = { jd_analysis: "Job description analysis", generation: "Resume generation", ats_scoring: "ATS score and report" } as const;

/**
 * Step 1 of estimate → hold → capture (prd.md §3.4): the most the run can
 * cost, shown before anything is held. Tailoring uses the same service the
 * confirm step re-checks against. Everything is userId-scoped.
 */
export async function estimateRun(raw: unknown): Promise<EstimateResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Pick a resume and a job first." };
  const { versionId, jdId, mode } = parsed.data;
  const { user } = await requireAppUser();
  const db = getDb();

  try {
    if (mode === "tailor") {
      const est = await estimateGeneration(db, { userId: user.id, sourceVersionId: versionId, jdId });
      return { ok: true, total: est.total, lines: est.lines.map((l) => ({ label: LABELS[l.action], credits: l.credits })) };
    }
    // Scoring: the same service the confirm step re-checks against. A cached report is free.
    const est = await estimateScoring(db, { userId: user.id, versionId, jdId, methodVersion: SCORING_METHOD_VERSION });
    if (est.cached) return { ok: true, total: 0, lines: [], cachedReportId: est.reportId };
    return { ok: true, total: est.total, lines: est.lines.map((l) => ({ label: LABELS[l.action], credits: l.credits })) };
  } catch (err) {
    const message = err instanceof Error && /review|highlighted|isn.t available|not found/i.test(err.message) ? err.message : "We couldn’t work out the cost right now. Please try again.";
    if (message.startsWith("We couldn")) console.error("[generate] estimate failed:", err);
    return { ok: false, message };
  }
}
