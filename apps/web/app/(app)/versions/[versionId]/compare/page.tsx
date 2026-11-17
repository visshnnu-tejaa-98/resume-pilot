import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareRunner } from "@/components/ats/CompareRunner";
import { CompareScores } from "@/components/ats/CompareScores";
import { AppMain } from "@/components/app/PageHeader";
import { loadCompare } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Compare scores" };

/** design/screens/Compare.dc.html */
export default async function ComparePage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ a?: string; jd?: string }> }) {
  const { user } = await requireAppUser();
  const page = await loadCompare(user.id, (await params).versionId, await searchParams);
  if (!page) notFound();
  return <AppMain className="gap-6">{page.ready ? <CompareScores c={page.view} /> : <CompareRunner {...page} />}</AppMain>;
}
