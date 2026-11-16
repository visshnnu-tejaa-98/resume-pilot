import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { fmtCredits, fmtRelative } from "@/lib/format";
import { appRoutes, routes } from "@/lib/routes";

export interface JobCardData {
  id: string;
  companyName: string | null;
  jobTitle: string | null;
  preview: string;
  chars: number;
  analysed: boolean;
  createdAt: Date;
  /** Required keywords, once analysed. */
  keywords?: string[];
}

/** Saved job card (design/screens/Jobs.dc.html). */
export function JobCard({ job }: { job: JobCardData }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Link href={appRoutes.job(job.id)} className="font-display text-lg font-bold text-text no-underline hover:underline">
            {job.companyName || "Untitled company"}
          </Link>
          <span className="text-sm text-text-2">{job.jobTitle || "Role not set"}</span>
        </div>
        <Chip tone={job.analysed ? "good" : "info"} pill className="px-[9px] py-[3px] text-xs font-semibold">
          {job.analysed ? "Analysed" : "Not analysed yet"}
        </Chip>
      </div>
      <p className="m-0 line-clamp-3 text-sm leading-[1.55] text-text-2">{job.preview}…</p>
      {job.keywords?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {job.keywords.map((k) => (
            <span key={k} className="rounded-md bg-surface-2 px-2 py-1 text-xs">
              {k}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex justify-between font-mono text-xs text-text-2">
        <span>{fmtCredits(job.chars)} chars</span>
        <span>Saved {fmtRelative(job.createdAt)}</span>
      </div>
      <div className="mt-auto flex flex-wrap gap-2.5 border-t border-border pt-3.5">
        <ButtonLink href={`${routes.generate}?jd=${job.id}`} className="h-9 px-3.5 text-[13px]">
          Tailor resume
        </ButtonLink>
        <ButtonLink href={`${routes.generate}?jd=${job.id}&mode=score`} variant="outline" className="h-9 border-border-strong px-3.5 text-[13px]">
          Score a resume
        </ButtonLink>
        <Link href={appRoutes.job(job.id)} className="ml-auto flex items-center text-[13px] font-semibold text-link">
          Edit as new
        </Link>
      </div>
    </article>
  );
}
