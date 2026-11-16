import { listResumes } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { ResumesView } from "@/components/resumes/ResumesView";
import type { VersionListItem } from "@/components/resumes/types";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "My resumes" };

/** design/screens/MyResumes.dc.html */
export default async function MyResumesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await requireAppUser();
  const [{ q }, resumes] = await Promise.all([searchParams, listResumes(getDb(), user.id)]);
  // Tailored versions arrive with generation (tasks/todo/m6-generation).
  const versions: VersionListItem[] = [];

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
    </AppMain>
  );
}
