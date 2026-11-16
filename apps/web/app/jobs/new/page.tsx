import { JdForm } from "../JdForm";
import { JobsShell, requireUser } from "../layout-parts";

export default async function NewJobPage() {
  await requireUser();
  return (
    <JobsShell
      crumb="New"
      title="Add a job description"
      subtitle="Paste the whole posting. The more detail, the better the match. Saving is free."
    >
      <JdForm />
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 0 }}>
        Saving is free. The job is analysed the first time you tailor or score against it, after you
        confirm the estimate.
      </p>
    </JobsShell>
  );
}
