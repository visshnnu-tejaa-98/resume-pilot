import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtsReport } from "@/components/ats/AtsReport";
import { AppMain } from "@/components/app/PageHeader";
import { loadAtsReport } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "ATS report" };

/** design/screens/AtsReport.dc.html */
export default async function AtsReportPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { user } = await requireAppUser();
  const report = await loadAtsReport(user.id, (await params).versionId);
  if (!report) notFound();
  return (
    <AppMain className="gap-6">
      <AtsReport r={report} />
    </AppMain>
  );
}
