import { listCampaigns } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { CampaignBuilder } from "@/components/admin/CampaignBuilder";
import { CancelCampaignButton } from "@/components/admin/CancelCampaignButton";
import { AdminCard, AdminTable, CardHeader, EmptyRow, StatusPill } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/admin-format";
import { getDb } from "@/server/db";
import { adminRoutes } from "@/components/admin/nav";
import { AppMain } from "@/components/app/PageHeader";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "New campaign" };

/** design/screens/AdminCampaign.dc.html */
export default async function AdminCampaignPage() {
  await requireAdmin();
  const campaigns = await listCampaigns(getDb(), 20);
  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <Link href={adminRoutes.emails} className="text-[13px] font-semibold text-link">
          ← Email templates
        </Link>
        <h1 className="m-0 font-display text-[28px] font-bold">New campaign</h1>
        <span className="text-sm text-text-2">Marketing email to a chosen group. Users who opted out of marketing are always left out.</span>
      </div>
      <CampaignBuilder />
      <AdminCard className="overflow-hidden">
        <CardHeader title="Campaigns" />
        <AdminTable head={["Subject", "Status", "When", "Recipients", "Sent", "Skipped", ""]} minWidth={720}>
          {campaigns.length === 0 ? (
            <EmptyRow cols={7}>No campaigns yet.</EmptyRow>
          ) : (
            campaigns.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[280px] truncate font-semibold">{c.subject}</td>
                <td>
                  <StatusPill status={c.status === "sending" ? "running" : c.status === "scheduled" ? "pending" : c.status === "cancelled" ? "skipped" : c.status} label={c.status} />
                </td>
                <td className="whitespace-nowrap text-text-2">{fmtDateTime(c.startedAt ?? c.scheduledAt ?? c.createdAt)}</td>
                <td className="font-mono">{c.recipientCount ?? "—"}</td>
                <td className="font-mono">{c.sentCount ?? "—"}</td>
                <td className="font-mono">{c.skippedCount ?? "—"}</td>
                <td>{c.status === "scheduled" || c.status === "draft" ? <CancelCampaignButton campaignId={c.id} subject={c.subject} /> : null}</td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>
    </AppMain>
  );
}
