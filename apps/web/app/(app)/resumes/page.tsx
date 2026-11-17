import { listDeletedVersions, listResumes, listVersions, VERSION_RESTORE_DAYS } from "@resume-pilot/services";
import { TEMPLATE_NAMES, toTemplateKey } from "@resume-pilot/resume-templates";
import type { Metadata } from "next";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { ResumesView } from "@/components/resumes/ResumesView";
import { RestoreVersionButton } from "@/components/resumes/VersionActions";
import type { VersionListItem } from "@/components/resumes/types";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "My resumes" };

/** design/screens/MyResumes.dc.html */
export default async function MyResumesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requireAppUser();
  const db = getDb();
  const [{ q }, resumes, all, deleted] = await Promise.all([searchParams, listResumes(db, user.id), listVersions(db, user.id), listDeletedVersions(db, user.id)]);
  const versions: VersionListItem[] = all
    .filter((v) => v.kind === "generated")
    .map((v) => ({
      id: v.id,
      resumeId: v.resumeId,
      company: v.companyName ?? "Tailored resume",
      role: v.jobTitle ?? "",
      score: v.score,
      scoreOutdated: v.scoreOutdated,
      template: TEMPLATE_NAMES[toTemplateKey(v.templateKey)],
      updatedAt: v.updatedAt,
      createdAt: v.createdAt,
      jdId: v.jdId,
      parentVersionId: v.parentVersionId,
    }));

  return (
    <AppMain className="gap-6">
      <PageHeader
        title="My resumes"
        subtitle="Each original keeps its tailored versions underneath it. Originals are never changed by AI."
        actions={
          <ButtonLink href={routes.upload} className="h-[42px] px-[18px] text-sm">
            Upload resume
          </ButtonLink>
        }
      />
      <ResumesView resumes={resumes} versions={versions} initialQuery={q ?? ""} />
      {deleted.length ? (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <h2 className="m-0 px-5 py-4 font-display text-lg font-bold">Recently deleted</h2>
          {deleted.map((v) => {
            const daysLeft = Math.max(0, VERSION_RESTORE_DAYS - Math.floor((Date.now() - +new Date(v.deletedAt!)) / 86_400_000));
            return (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-sm">
                <span>
                  <strong>{[v.companyName, v.jobTitle].filter(Boolean).join(" · ") || "Tailored resume"}</strong>{" "}
                  <span className="text-text-2">· restorable for {daysLeft} more day{daysLeft === 1 ? "" : "s"}</span>
                </span>
                <RestoreVersionButton versionId={v.id} />
              </div>
            );
          })}
        </section>
      ) : null}
    </AppMain>
  );
}
