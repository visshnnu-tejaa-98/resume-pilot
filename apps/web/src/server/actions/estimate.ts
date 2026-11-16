"use server";

import { estimateAction, getJobDescription, getOriginalVersion, listJobDescriptions } from "@resume-pilot/services";
import { z } from "zod";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

const inputSchema = z.object({
  resumeId: z.uuid(),
  jdId: z.uuid(),
  mode: z.enum(["tailor", "score"]),
});

export interface EstimateLine {
  label: string;
  credits: number;
}

export type EstimateResult = { ok: true; lines: EstimateLine[]; total: number } | { ok: false; message: string };

/**
 * Step 1 of estimate → hold → capture (prd.md §3.4): the maximum credits
 * the run can use, shown before anything is charged. Computed with the
 * same pricing config the hold will use. Ownership of both the resume and
 * the job is checked via userId-scoped lookups.
 */
export async function estimateRun(raw: unknown): Promise<EstimateResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Pick a resume and a job first." };
  const { resumeId, jdId, mode } = parsed.data;
  const { user } = await requireAppUser();
  const db = getDb();

  const [version, jd, jobs] = await Promise.all([
    getOriginalVersion(db, { userId: user.id, resumeId }),
    getJobDescription(db, { userId: user.id, jdId }).catch(() => null),
    listJobDescriptions(db, user.id),
  ]);
  if (!version || !jd) return { ok: false, message: "That resume or job isn’t available." };

  try {
    const resumeText = JSON.stringify(version.content);
    const lines: EstimateLine[] = [];
    const analysed = jobs.find((j) => j.id === jdId)?.analysed ?? false;
    if (!analysed) {
      const e = await estimateAction(db, "jd_analysis", [jd.text]);
      lines.push({ label: "Job description analysis", credits: e.credits });
    }
    const main = await estimateAction(db, mode === "tailor" ? "generation" : "ats_scoring", [resumeText, jd.text]);
    lines.push({ label: mode === "tailor" ? "Resume generation" : "ATS score and report", credits: main.credits });
    return { ok: true, lines, total: lines.reduce((n, l) => n + l.credits, 0) };
  } catch (err) {
    console.error("[generate] estimate failed:", err);
    return { ok: false, message: "We couldn’t work out the cost right now. Please try again." };
  }
}
