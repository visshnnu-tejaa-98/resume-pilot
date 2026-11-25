import { listJobDescriptions, listVersions } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { AtsScorePicker } from "@/components/ats/AtsScorePicker";
import { fmtRelative } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "ATS score" };

/** Score any resume (original or tailored) against any saved job description. */
export default async function AtsScorePage({ searchParams }: { searchParams: Promise<{ version?: string; jd?: string }> }) {
  const { user } = await requireAppUser();
  const db = getDb();
  const [sp, versions, jds] = await Promise.all([searchParams, listVersions(db, user.id), listJobDescriptions(db, user.id)]);
  const resumes = versions.map((v) => ({
    id: v.id,
    name:
      v.kind === "original"
        ? `Original · ${v.fileName}`
        : `${[v.companyName, v.jobTitle].filter(Boolean).join(" · ") || "Tailored resume"} · ${fmtRelative(v.createdAt).toLowerCase()}`,
    jdId: v.jdId,
    score: v.score,
  }));
  const jobs = jds.map((j) => ({ id: j.id, name: [j.companyName, j.jobTitle].filter(Boolean).join(" · ") || "Untitled job" }));

  return (
    <AppMain className="gap-6">
      <PageHeader title="ATS score" subtitle="Pick any resume and any saved job description to see how well they match." />
      <AtsScorePicker resumes={resumes} jobs={jobs} initialVersion={sp.version} initialJd={sp.jd} />
    </AppMain>
  );
}
