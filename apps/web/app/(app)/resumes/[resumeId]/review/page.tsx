import { listResumes } from "@resume-pilot/services";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppMain } from "@/components/app/PageHeader";
import { ReviewEditor } from "@/components/review/ReviewEditor";
import { getDb } from "@/server/db";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Review your resume" };

/**
 * design/screens/ResumeReview.dc.html — prd.md §5.3 step 7. The resume
 * content loads client-side over tRPC (owner-checked there); this page
 * only confirms the resume is the caller's and shows its file name.
 */
export default async function ReviewPage({ params }: { params: Promise<{ resumeId: string }> }) {
  const { user } = await requireAppUser();
  const { resumeId } = await params;
  const resume = (await listResumes(getDb(), user.id)).find((r) => r.id === resumeId);
  if (!resume) notFound();
  return (
    <AppMain className="gap-6">
      <ReviewEditor resumeId={resume.id} fileName={resume.fileName} />
    </AppMain>
  );
}
