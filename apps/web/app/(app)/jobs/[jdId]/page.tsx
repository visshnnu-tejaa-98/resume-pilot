import { getJobDescription, JdNotFoundError } from "@resume-pilot/services";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JdForm, JdFormAside } from "@/components/jobs/JdForm";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { fmtDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Job description" };

/** Saved job: view and "edit as new" (same layout as JobNew). */
export default async function JobPage({ params }: { params: Promise<{ jdId: string }> }) {
  const { user } = await requireAppUser();
  const { jdId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jdId)) notFound();
  const jd = await getJobDescription(getDb(), { userId: user.id, jdId }).catch((err) => {
    if (err instanceof JdNotFoundError) notFound();
    throw err;
  });

  return (
    <AppMain className="gap-6">
      <PageHeader
        crumbs={[{ href: routes.jobs, label: "Job descriptions" }]}
        title={[jd.companyName, jd.jobTitle].filter(Boolean).join(" · ") || "Job description"}
        subtitle={`Saved ${fmtDate(jd.createdAt)}. Edits are saved as a new job.`}
      />
      <div className="flex flex-wrap items-start gap-6">
        <JdForm
          jdId={jd.id}
          initial={{
            text: jd.text,
            companyName: jd.companyName ?? "",
            jobTitle: jd.jobTitle ?? "",
            postingUrl: jd.postingUrl ?? "",
          }}
        />
        <JdFormAside />
      </div>
    </AppMain>
  );
}
