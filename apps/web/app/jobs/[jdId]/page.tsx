import { getJobDescription, JdNotFoundError } from "@resume-pilot/services";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { JdForm } from "../JdForm";
import { JobsShell, requireUser } from "../layout-parts";

export default async function JobPage({ params }: { params: Promise<{ jdId: string }> }) {
  const user = await requireUser();
  const { jdId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jdId)) notFound();
  const jd = await getJobDescription(getDb(), { userId: user.id, jdId }).catch((err) => {
    if (err instanceof JdNotFoundError) notFound();
    throw err;
  });
  return (
    <JobsShell
      crumb={jd.jobTitle || "Job"}
      title={[jd.jobTitle, jd.companyName].filter(Boolean).join(" · ") || "Job description"}
      subtitle={`Saved ${jd.createdAt.toLocaleDateString("en-IN")}`}
    >
      <JdForm
        jdId={jd.id}
        initial={{
          text: jd.text,
          companyName: jd.companyName ?? "",
          jobTitle: jd.jobTitle ?? "",
          postingUrl: jd.postingUrl ?? "",
        }}
      />
    </JobsShell>
  );
}
