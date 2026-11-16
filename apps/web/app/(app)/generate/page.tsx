import { listJobDescriptions, listResumes } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AppMain } from "@/components/app/PageHeader";
import { GenerateView } from "@/components/generate/GenerateView";
import { getDb } from "@/server/db";
import { getAppWallet, requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Tailor a resume" };

/**
 * design/screens/Generate.dc.html. `?resume=` / `?jd=` preselect (from My
 * resumes and Jobs); `?mode=score` turns it into "Score a resume".
 */
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string; jd?: string; mode?: string }>;
}) {
  const { user } = await requireAppUser();
  const db = getDb();
  const [sp, resumes, jobs, wallet] = await Promise.all([
    searchParams,
    listResumes(db, user.id),
    listJobDescriptions(db, user.id),
    getAppWallet(user.id),
  ]);
  const sources = resumes.filter((r) => r.status === "ready").map((r) => ({ id: r.id, name: r.fileName, createdAt: r.createdAt }));
  const jobOptions = jobs.map((j) => ({
    id: j.id,
    name: [j.companyName, j.jobTitle].filter(Boolean).join(" · ") || "Untitled job",
    chars: j.chars,
    analysed: j.analysed,
  }));
  const pick = <T extends { id: string }>(list: T[], id?: string) => (id && list.some((x) => x.id === id) ? id : null);

  return (
    <AppMain className="gap-6">
      <GenerateView
        mode={sp.mode === "score" ? "score" : "tailor"}
        sources={sources}
        jobs={jobOptions}
        initialSource={pick(sources, sp.resume)}
        initialJob={pick(jobOptions, sp.jd)}
        balance={wallet.balance}
      />
    </AppMain>
  );
}
