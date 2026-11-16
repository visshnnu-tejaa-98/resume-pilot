import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewView } from "@/components/editor/PreviewView";
import { loadVersion } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Preview and download" };

/** design/screens/Preview.dc.html */
export default async function VersionPreviewPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { user } = await requireAppUser();
  const version = await loadVersion(user.id, (await params).versionId);
  if (!version) notFound();
  return <PreviewView version={version} />;
}
