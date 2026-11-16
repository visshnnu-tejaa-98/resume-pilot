import type { Metadata } from "next";
import { FlowSteps } from "@/components/app/FlowSteps";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { requireAppUser } from "@/server/session";

export const metadata: Metadata = { title: "Upload resume" };

const notes = [
  { h: "Your original stays safe", p: "Tailored versions are always separate copies. AI never changes your original." },
  { h: "Scanned or photo?", p: "We read it with OCR. A clear, well-lit photo gives the best result." },
  { h: "Private by default", p: "Files are stored privately and deleted after 30 days. Your structured resume stays until you delete it." },
];

/** design/screens/Upload.dc.html */
export default async function UploadPage() {
  await requireAppUser();
  return (
    <AppMain width="md" className="gap-6">
      <FlowSteps current={0} />
      <PageHeader
        title="Upload your resume"
        subtitle="We'll read it and turn it into sections you can check and edit. Uploading is free."
      />
      <UploadPanel />
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
        {notes.map((n) => (
          <div key={n.h} className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-4">
            <strong className="text-sm">{n.h}</strong>
            <span className="text-[13px] leading-[1.55] text-text-2">{n.p}</span>
          </div>
        ))}
      </div>
    </AppMain>
  );
}
