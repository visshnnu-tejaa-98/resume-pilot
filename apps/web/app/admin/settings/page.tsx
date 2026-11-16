import { JD_TEXT_MAX, JD_TEXT_MIN } from "@resume-pilot/validators";
import { adminListAdmins } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AdminCard, AdminTable, CardHeader, NotWiredNote } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { maskEmail } from "@/lib/admin-format";
import { fmtDate } from "@/lib/format";
import { MAX_IMAGE_PAGES, MAX_UPLOAD_BYTES } from "@/lib/upload";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "App settings" };

/**
 * design/screens/AdminSettings.dc.html. These limits are currently code
 * constants (shown read-only); moving them to a settings table so they
 * change without a deploy is a separate task.
 */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const admins = await adminListAdmins(getDb());
  const groups: { title: string; fields: [string, string, string][] }[] = [
    {
      title: "Uploads and job descriptions",
      fields: [
        ["Max file size", "Per upload", `${MAX_UPLOAD_BYTES / 1024 / 1024} MB`],
        ["Max pages or images", "Per upload", `${MAX_IMAGE_PAGES} pages`],
        ["Job description max", "Characters", JD_TEXT_MAX.toLocaleString("en-IN")],
        ["Job description min", "Characters", JD_TEXT_MIN.toLocaleString("en-IN")],
      ],
    },
    {
      title: "Retention",
      fields: [["Uploaded files", "Then deleted from storage", "30 days"]],
    },
  ];
  const flags: [string, string][] = [
    ["Maintenance mode", "Pause the app for all users"],
    ["New sign-ups", "Allow new accounts"],
    ["LinkedIn sign-in", "Show LinkedIn on sign-in pages"],
    ["Referral codes", "Allow referral codes to be applied"],
  ];

  return (
    <AppMain width="md" className="gap-5">
      <h1 className="m-0 font-display text-[28px] font-bold">App settings</h1>
      <NotWiredNote>These values are code constants today and shown read-only. Editing them here needs a settings table and audited writes.</NotWiredNote>

      {groups.map((g) => (
        <AdminCard key={g.title} className="overflow-hidden">
          <CardHeader title={g.title} />
          {g.fields.map(([label, help, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5">
              <span className="flex flex-col gap-0.5">
                <strong className="text-sm">{label}</strong>
                <span className="text-xs text-text-2">{help}</span>
              </span>
              <span className="font-mono text-sm">{value}</span>
            </div>
          ))}
        </AdminCard>
      ))}

      <AdminCard className="overflow-hidden">
        <CardHeader title="Switches" />
        {flags.map(([label, help]) => (
          <div key={label} className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5">
            <span className="flex flex-col gap-0.5">
              <strong className="text-sm">{label}</strong>
              <span className="text-xs text-text-2">{help}</span>
            </span>
            <Switch checked={label !== "Maintenance mode"} onChange={() => undefined} label={label} disabled />
          </div>
        ))}
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <CardHeader title="Admins" />
        <AdminTable head={["Email", "Role", "Since"]} minWidth={420}>
          {admins.map((a) => (
            <tr key={a.id}>
              <td>{maskEmail(a.email)}</td>
              <td>Admin</td>
              <td className="text-text-2">{fmtDate(a.createdAt)}</td>
            </tr>
          ))}
        </AdminTable>
        <p className="m-0 border-t border-border px-5 py-3 text-xs text-text-2">Admin role is granted in the database (users.role). Inviting from here isn&apos;t built yet.</p>
      </AdminCard>
    </AppMain>
  );
}
