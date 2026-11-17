import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { scoreChip } from "@/lib/domain";
import { fmtDate, fmtRelative } from "@/lib/format";
import { appRoutes } from "@/lib/routes";
import type { VersionListItem } from "./types";
import { VersionActions } from "./VersionActions";

const th = "px-3 py-3 text-xs uppercase tracking-[0.06em] text-text-2";

/** Tailored versions under one original (design/screens/MyResumes.dc.html). */
export function VersionTable({ versions }: { versions: VersionListItem[] }) {
  if (versions.length === 0) {
    return <p className="m-0 px-5 py-5 text-sm text-text-2">No tailored versions yet. Use New version to tailor this resume to a job.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            <th scope="col" className={`${th} pl-5`}>Version</th>
            <th scope="col" className={th}>ATS score</th>
            <th scope="col" className={th}>Template</th>
            <th scope="col" className={th}>Created</th>
            <th scope="col" className={th}>Updated</th>
            <th scope="col" className={`${th} pr-5 text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const chip = scoreChip(v.score, v.scoreOutdated);
            return (
              <tr key={v.id} className="border-t border-border">
                <td className="py-4 pr-3 pl-5">
                  <div className="flex items-center gap-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="stroke-border-strong" strokeWidth="2" aria-hidden="true">
                      <path d="M5 3v10a4 4 0 0 0 4 4h10M15 13l4 4-4 4" />
                    </svg>
                    <div className="flex flex-col gap-0.5">
                      <strong>{v.company}</strong>
                      <span className="text-[13px] text-text-2">{v.role}</span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4">
                  <Chip tone={chip.tone} mono className="px-2 py-1">
                    {chip.label}
                  </Chip>
                </td>
                <td className="px-3 py-4 text-text-2">{v.template}</td>
                <td className="px-3 py-4 text-text-2">{fmtDate(v.createdAt)}</td>
                <td className="px-3 py-4 text-text-2">{fmtRelative(v.updatedAt)}</td>
                <td className="py-4 pr-5 pl-3">
                  <div className="flex justify-end gap-3.5 font-semibold">
                    <Link href={appRoutes.version(v.id)} className="text-link">Edit</Link>
                    <Link href={appRoutes.versionReport(v.id)} className="text-link">
                      {v.score === null ? "Score" : v.scoreOutdated ? "Re-score" : "Report"}
                    </Link>
                    {v.jdId && v.parentVersionId ? (
                      <Link href={appRoutes.versionCompare(v.id)} className="text-link">Compare</Link>
                    ) : null}
                    <Link href={appRoutes.versionPreview(v.id)} className="text-link" title="Preview and download the PDF">Preview / PDF</Link>
                    <VersionActions versionId={v.id} label={[v.company, v.role].filter(Boolean).join(" · ")} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
