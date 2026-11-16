import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompareScores } from "@/components/ats/CompareScores";
import { AppMain } from "@/components/app/PageHeader";
import { loadCompare } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Compare scores" };

/** design/screens/Compare.dc.html */
export default async function ComparePage({ params }: { params: Promise<{ versionId: string }> }) {
  const { user } = await requireAppUser();
  const compare = await loadCompare(user.id, (await params).versionId);
  if (!compare) notFound();
  return (
    <AppMain className="gap-6">
      <CompareScores c={compare} />
    </AppMain>
  );
}
