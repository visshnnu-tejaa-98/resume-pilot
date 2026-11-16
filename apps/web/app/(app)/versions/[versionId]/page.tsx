import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorView } from "@/components/editor/EditorView";
import { loadVersion } from "@/server/versions";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Editor" };

/** design/screens/Editor.dc.html */
export default async function VersionEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { user } = await requireAppUser();
  const version = await loadVersion(user.id, (await params).versionId);
  if (!version) notFound();
  return <EditorView version={version} />;
}
