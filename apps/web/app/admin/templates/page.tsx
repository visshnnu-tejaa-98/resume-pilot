import { adminResumeTemplates } from "@resume-pilot/services";
import type { Metadata } from "next";
import { ResumeTemplateCard } from "@/components/admin/ResumeTemplateCard";
import { NotWiredNote } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Templates" };

/** design/screens/AdminTemplates.dc.html — rows from resume_templates. */
export default async function AdminTemplatesPage() {
  await requireAdmin();
  const templates = await adminResumeTemplates(getDb());
  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[28px] font-bold">Templates</h1>
        <span className="text-sm text-text-2">
          All templates are single-column, A4, selectable text. Disabled templates stay on existing versions but can&apos;t be newly picked.
        </span>
      </div>
      {templates.length === 0 ? (
        <NotWiredNote>No rows in resume_templates yet. They&apos;re seeded with the templates package (m8).</NotWiredNote>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))" }}>
          {templates.map((t) => (
            <ResumeTemplateCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </AppMain>
  );
}
