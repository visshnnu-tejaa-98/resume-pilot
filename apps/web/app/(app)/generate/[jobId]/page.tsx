import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppMain } from "@/components/app/PageHeader";
import { GenerationProgress } from "@/components/generate/GenerationProgress";
import { loadGeneration } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Tailoring your resume" };

/** design/screens/GenProgress.dc.html — refreshes itself while running. */
export default async function GenerationPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { user } = await requireAppUser();
  const { jobId } = await params;
  const gen = await loadGeneration(user.id, jobId);
  if (!gen) notFound();
  return (
    <AppMain width="full" className="py-14">
      {gen.status === "running" ? <meta httpEquiv="refresh" content="4" /> : null}
      <GenerationProgress g={gen} />
    </AppMain>
  );
}
