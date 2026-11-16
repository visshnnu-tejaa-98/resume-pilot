import { listJobDescriptions } from "@resume-pilot/services";
import Link from "next/link";
import { getDb } from "@/server/db";
import * as styles from "@/components/auth-styles";
import { JobsShell, requireUser } from "./layout-parts";

export default async function JobsPage() {
  const user = await requireUser();
  const jds = await listJobDescriptions(getDb(), user.id);
  return (
    <JobsShell crumb="All" title="Job descriptions" subtitle="Saved jobs you can tailor and score resumes against.">
      <div className="flex flex-col gap-3">
        <Link href="/jobs/new" style={{ ...styles.primaryButton, alignSelf: "flex-start", padding: "0 18px", display: "flex", alignItems: "center" }}>
          + Add job description
        </Link>
        {jds.length === 0 && <p style={{ color: "var(--color-text-secondary)" }}>No saved jobs yet.</p>}
        {jds.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} style={{ color: "inherit", textDecoration: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: 14 }}>
            <strong>{[j.jobTitle, j.companyName].filter(Boolean).join(" · ") || "Untitled job"}</strong>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              {j.preview}… · {j.createdAt.toLocaleDateString("en-IN")}
            </div>
          </Link>
        ))}
      </div>
    </JobsShell>
  );
}
