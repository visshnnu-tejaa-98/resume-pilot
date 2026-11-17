import "server-only";
import { SCORING_METHOD_VERSION, type StoredReport } from "@resume-pilot/ai";
import { pdfFileName, currentReport, getGenerationStatus, getJobDescription, getVersion, listJobDescriptions, listVersionReports, type GenerationMeta } from "@resume-pilot/services";
import type { Provenance } from "@resume-pilot/validators/resume";
import { DEMO_ID, demoCompare, demoReport } from "@/features/versions/demo";
import type { AtsReportView, CompareView, GenerationView, VersionView } from "@/features/versions/types";
import { fmtRelative } from "@/lib/format";
import { appRoutes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { TEMPLATE_NAMES, toTemplateKey } from "@resume-pilot/resume-templates";
import type { TemplateName } from "@/stores/preferences-store";

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
    template: TEMPLATE_NAMES[toTemplateKey(v.templateKey)] as TemplateName,
    savedAt: v.updatedAt,
    content: v.content,
    provenance,
    sourceBulletTexts,
    gaps: meta.gaps ?? [],
    score: v.score === null ? null : { value: v.score, outdated: v.scoreOutdated },
    fileName: pdfFileName(v.content, v.jobTitle),
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

type ReportRecord = NonNullable<Awaited<ReturnType<typeof currentReport>>>;
const jobName = (r: { companyName: string | null; jobTitle: string | null }) => [r.companyName, r.jobTitle].filter(Boolean).join(" · ") || "Untitled job";
const versionName = (v: { kind: string; fileName: string | null; companyName: string | null; jobTitle: string | null }) =>
  v.kind === "original" ? `${v.fileName ?? "Resume"} · Original` : [v.companyName, v.jobTitle].filter(Boolean).join(" · ") || "Tailored version";

/** Stored report (ai/scoring StoredReport) → the report screen. Every matched keyword links to its resume line. */
function toReportView(versionId: string, title: string, r: ReportRecord, history: ReportRecord[]): AtsReportView {
  const rep = r.report as StoredReport;
  const dims = r.breakdown as { label: string; weightPct: number; points: number; max: number }[];
  const reqs = rep.requirements;
  const matched = reqs
    .filter((q) => q.status !== "missing" && q.evidence.length)
    .flatMap((q) => (q.keywordsFound.length ? q.keywordsFound : [q.keywords[0] ?? q.text]).map((k) => ({ keyword: k, evidence: q.evidence[0]!.line, href: `${appRoutes.version(versionId)}#item-${q.evidence[0]!.id}` })));
  const uniq = [...new Map(matched.map((m) => [m.keyword.toLowerCase(), m])).values()];
  const missing = reqs
    .filter((q) => q.status !== "matched")
    .map((q) => ({ keyword: q.keywordsMissing[0] ?? q.keywords[0] ?? q.text, priority: q.priority === "required" ? ("Required" as const) : ("Preferred" as const), why: q.reason || q.text, partial: q.status === "partial" }));
  const count = (p: string) => {
    const xs = reqs.filter((q) => q.priority === p);
    return { all: xs.length, hit: xs.filter((q) => q.status === "matched").length, part: xs.filter((q) => q.status === "partial").length };
  };
  const req = count("required");
  const pref = count("preferred");
  const failed = rep.checks.filter((c) => !c.passed);
  return {
    versionId,
    title,
    subtitle: `Against ${jobName(r)} · scored ${fmtRelative(r.createdAt).toLowerCase()}`,
    jdId: r.jdId,
    outdated: r.outdated,
    score: r.overallScore,
    band: rep.band,
    dimensions: dims.map((d) => ({ label: d.label, weightPct: d.weightPct, value: d.points, max: d.max })),
    summary: rep.assessment,
    matched: uniq,
    matchedTotal: uniq.length,
    missing,
    skillStats: [
      { label: "Required requirements", value: `${req.hit} / ${req.all}`, sub: req.part ? `${req.part} partly met` : "met in full" },
      { label: "Preferred requirements", value: `${pref.hit} / ${pref.all}`, sub: pref.part ? `${pref.part} partly met` : "met in full" },
      { label: "Experience", value: `${rep.years.toFixed(1)} yrs`, sub: rep.minYears ? `job asks for ${rep.minYears}+` : "no minimum stated" },
      { label: "Format checks", value: `${rep.checks.length - failed.length} / ${rep.checks.length}`, sub: failed.length ? failed.map((c) => c.label).join(", ") : "all passed" },
    ],
    recommendations: rep.recommendations.map((x) => ({ title: x.title, body: x.detail })),
    history: history.map((h) => ({ when: fmtRelative(h.createdAt), note: `${jobName(h)}${h.outdated ? " · earlier content" : ""}`, score: h.overallScore })),
  };
}

export interface AtsReportPage {
  versionId: string;
  title: string;
  jdId: string | null;
  jobs: { id: string; name: string }[];
  report: AtsReportView | null;
}

/** Report for a version + JD (default: the version's own JD, else the latest scored one). */
export async function loadAtsReport(userId: string, versionId: string, q: { jd?: string } = {}): Promise<AtsReportPage | null> {
  if (isDemo(versionId)) return { versionId, title: demoReport.title, jdId: DEMO_ID, jobs: [], report: demoReport };
  if (!UUID.test(versionId)) return null;
  const db = getDb();
  const v = await getVersion(db, { userId, versionId }).catch(() => null);
  if (!v) return null;
  const [history, jds] = await Promise.all([listVersionReports(db, { userId, versionId }), listJobDescriptions(db, userId)]);
  const jobs = jds.map((j) => ({ id: j.id, name: jobName(j) }));
  const jdId = (q.jd && jobs.some((j) => j.id === q.jd) ? q.jd : null) ?? v.jdId ?? history[0]?.jdId ?? null;
  const title = versionName(v);
  const forJd = history.filter((h) => h.jdId === jdId);
  const latest = forJd[0];
  return { versionId, title, jdId, jobs, report: latest ? toReportView(versionId, title, latest, forJd) : null };
}

export type ComparePage =
  | { ready: true; view: CompareView }
  | { ready: false; versionId: string; aVersionId: string; jdId: string; aLabel: string; bLabel: string; jobLabel: string };

/** §9.4: A = parent/original (or ?a), B = this version, against the version's JD (or ?jd). */
export async function loadCompare(userId: string, versionId: string, q: { a?: string; jd?: string } = {}): Promise<ComparePage | null> {
  if (isDemo(versionId)) return { ready: true, view: demoCompare };
  if (!UUID.test(versionId)) return null;
  const db = getDb();
  const b = await getVersion(db, { userId, versionId }).catch(() => null);
  if (!b) return null;
  const aId = q.a && UUID.test(q.a) ? q.a : b.parentVersionId;
  const a = aId ? await getVersion(db, { userId, versionId: aId }).catch(() => null) : null;
  const jdId = q.jd && UUID.test(q.jd) ? q.jd : b.jdId;
  if (!a || !jdId) return null;

  const [ra, rb] = await Promise.all([
    currentReport(db, { userId, versionId: a.id, jdId, methodVersion: SCORING_METHOD_VERSION }).catch(() => null),
    currentReport(db, { userId, versionId: b.id, jdId, methodVersion: SCORING_METHOD_VERSION }).catch(() => null),
  ]);
  const aLabel = versionName(a);
  const bLabel = versionName(b);
  if (!ra || !rb) {
    const jd = await getJobDescription(db, { userId, jdId }).catch(() => null);
    if (!jd) return null;
    return { ready: false, versionId, aVersionId: a.id, jdId, aLabel, bLabel, jobLabel: jobName(jd) };
  }

  const repA = ra.report as StoredReport;
  const repB = rb.report as StoredReport;
  const dimsA = ra.breakdown as { label: string; points: number; max: number }[];
  const dimsB = rb.breakdown as { label: string; points: number; max: number }[];
  const found = (r: StoredReport) => new Set(r.requirements.filter((x) => x.status !== "missing").flatMap((x) => x.keywordsFound.map((k) => k.toLowerCase())));
  const inA = found(repA);
  const gained = [...new Set(repB.requirements.filter((x) => x.status !== "missing").flatMap((x) => x.keywordsFound).filter((k) => !inA.has(k.toLowerCase())))];

  // One rewritten bullet, original vs tailored, from B's provenance.
  const bv = await loadVersion(userId, versionId);
  const bulletText = new Map([...b.content.workExperience, ...b.content.projects].flatMap((x) => x.bullets.map((bl) => [bl.id, bl.text] as const)));
  const firstDiff = Object.entries(bv?.sourceBulletTexts ?? {}).find(([id]) => bulletText.has(id));

  return {
    ready: true,
    view: {
      versionId,
      aVersionId: a.id,
      jdId,
      a: { label: aLabel, score: ra.overallScore },
      b: { label: bLabel, score: rb.overallScore },
      jobLabel: jobName(rb),
      free: true,
      rows: dimsB.map((d, i) => ({ label: d.label, a: dimsA[i]?.points ?? 0, b: d.points, max: d.max })),
      gained,
      stillMissing: repB.requirements.filter((x) => x.status !== "matched").map((x) => ({ keyword: x.keywordsMissing[0] ?? x.keywords[0] ?? x.text, partial: x.status === "partial" })),
      bulletDiff: firstDiff ? { original: firstDiff[1], tailored: bulletText.get(firstDiff[0])! } : { original: "", tailored: "" },
    },
  };
}
