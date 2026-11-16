import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppMain } from "@/components/app/PageHeader";
import { GenerationProgress } from "@/components/generate/GenerationProgress";
import { loadGeneration } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Tailoring your resume" };

/** design/screens/GenProgress.dc.html. `?status=` only applies to the dev-only demo id. */
export default async function GenerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { user } = await requireAppUser();
  const [{ jobId }, { status }] = await Promise.all([params, searchParams]);
  const gen = await loadGeneration(user.id, jobId, status);
  if (!gen) notFound();
  return (
    <AppMain width="full" className="py-14">
      {gen.status === "running" ? <meta httpEquiv="refresh" content="4" /> : null}
      <GenerationProgress g={gen} />
    </AppMain>
  );
}
