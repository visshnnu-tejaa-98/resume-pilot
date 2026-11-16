import type { Metadata } from "next";
import { JdForm, JdFormAside } from "@/components/jobs/JdForm";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { routes } from "@/lib/routes";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Add a job description" };

/** design/screens/JobNew.dc.html */
export default async function NewJobPage() {
  await requireAppUser();
  return (
    <AppMain className="gap-6">
      <PageHeader
        crumbs={[{ href: routes.jobs, label: "Job descriptions" }]}
        title="Add a job description"
        subtitle="Paste the whole posting. The more detail, the better the match. Saving is free."
      />
      <div className="flex flex-wrap items-start gap-6">
        <JdForm />
        <JdFormAside />
      </div>
    </AppMain>
  );
}
