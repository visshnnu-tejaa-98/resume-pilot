import { listJobDescriptions } from "@resume-pilot/services";
import { jdAnalysisSchema, topKeywords } from "@resume-pilot/validators";
import type { Metadata } from "next";
import { JobCard } from "@/components/jobs/JobCard";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Job descriptions" };

/** design/screens/Jobs.dc.html */
export default async function JobsPage() {
  const { user } = await requireAppUser();
  const jobs = await listJobDescriptions(getDb(), user.id);

  return (
    <AppMain className="gap-6">
      <PageHeader
        title="Job descriptions"
        subtitle="Saved jobs are analysed once, then reused for free in every version and score."
        actions={
          <ButtonLink href={routes.jobNew} className="h-[42px] px-[18px] text-sm">
            New job description
          </ButtonLink>
        }
      />
      {jobs.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-strong bg-surface p-6">
          <strong className="font-display text-[17px]">No saved jobs yet</strong>
          <span className="text-sm text-text-2">Paste a job posting to tailor and score your resume against it. Saving is free.</span>
          <ButtonLink href={routes.jobNew} size="sm" className="h-10 text-sm">
            Add a job description
          </ButtonLink>
        </section>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
          {jobs.map((j) => (
            <JobCard key={j.id} job={{ ...j, keywords: keywordsOf(j.requirements) }} />
          ))}
        </div>
      )}
      <span className="text-[13px] text-text-2">
        Editing a job description saves it as a new job, so older versions keep the job they were built from.
      </span>
    </AppMain>
  );
}

/** Headline keywords from a stored analysis; tolerant of an unexpected shape. */
function keywordsOf(requirements: unknown): string[] | undefined {
  const parsed = jdAnalysisSchema.shape.requirements.safeParse(requirements);
  return parsed.success ? topKeywords({ requirements: parsed.data }, 5) : undefined;
}
