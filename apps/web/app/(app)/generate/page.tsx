import { listJobDescriptions, listResumes, listVersions } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AppMain } from "@/components/app/PageHeader";
import { GenerateView } from "@/components/generate/GenerateView";
import { fmtRelative } from "@/lib/format";
import { getDb } from "@/server/db";
import { getAppWallet, requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Tailor a resume" };

/**
 * design/screens/Generate.dc.html. `?resume=` (resume id) / `?version=` /
 * `?jd=` preselect; `?mode=score` turns it into "Score a resume".
 * Any live version can be the source — edits in it count as source facts (§8.6).
 */
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string; version?: string; jd?: string; mode?: string }>;
}) {
  const { user } = await requireAppUser();
  const db = getDb();
  const [sp, resumes, versions, jobs, wallet] = await Promise.all([
    searchParams,
    listResumes(db, user.id),
    listVersions(db, user.id),
    listJobDescriptions(db, user.id),
    getAppWallet(user.id),
  ]);
  const ready = new Set(resumes.filter((r) => r.status === "ready").map((r) => r.id));
  const sources = versions
    .filter((v) => v.kind === "generated" || ready.has(v.resumeId))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "original" ? -1 : 1))
    .map((v) => ({
      id: v.id,
      name: v.kind === "original" ? `${v.fileName} · Original` : [v.companyName, v.jobTitle].filter(Boolean).join(" · ") || "Tailored version",
      sub: v.kind === "original" ? `Original · uploaded ${fmtRelative(v.createdAt)}` : `Tailored version · edited ${fmtRelative(v.updatedAt).toLowerCase()}`,
    }));
  const jobOptions = jobs.map((j) => ({
    id: j.id,
    name: [j.companyName, j.jobTitle].filter(Boolean).join(" · ") || "Untitled job",
    chars: j.chars,
    analysed: j.analysed,
  }));
  const fromResume = sp.resume ? versions.find((v) => v.kind === "original" && v.resumeId === sp.resume)?.id : undefined;
  const pick = <T extends { id: string }>(list: T[], id?: string) => (id && list.some((x) => x.id === id) ? id : null);

  return (
    <AppMain className="gap-6">
      <GenerateView
        mode={sp.mode === "score" ? "score" : "tailor"}
        sources={sources}
        jobs={jobOptions}
        initialSource={pick(sources, sp.version ?? fromResume)}
        initialJob={pick(jobOptions, sp.jd)}
        balance={wallet.balance}
      />
    </AppMain>
  );
}
