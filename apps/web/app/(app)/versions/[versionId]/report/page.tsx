import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtsReport } from "@/components/ats/AtsReport";
import { ScoreEmpty } from "@/components/ats/ScoreEmpty";
import { ScoringPending } from "@/components/ats/ScoreRunner";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { appRoutes, routes } from "@/lib/routes";
import { loadAtsReport } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "ATS report" };

/** design/screens/AtsReport.dc.html */
export default async function AtsReportPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ jd?: string; job?: string }> }) {
  const { user } = await requireAppUser();
  const sp = await searchParams;
  const page = await loadAtsReport(user.id, (await params).versionId, { jd: sp.jd });
  if (!page) notFound();
  const pending = sp.job && page.jdId ? <ScoringPending versionId={page.versionId} jdId={page.jdId} aiJobId={sp.job} isAdmin={user.role === "admin"} /> : null;
  return (
    <AppMain className="gap-6">
      {page.report && !(pending && page.report.outdated) ? (
        <>
          {pending}
          <AtsReport r={page.report} />
        </>
      ) : (
        <>
          <PageHeader
            crumbs={[
              { href: routes.resumes, label: "My resumes" },
              { href: appRoutes.version(page.versionId), label: page.title },
            ]}
            title="ATS report"
            subtitle="See how well this resume matches a job."
          />
          {pending ?? <ScoreEmpty versionId={page.versionId} jobs={page.jobs} initialJd={page.jdId} />}
        </>
      )}
    </AppMain>
  );
}
