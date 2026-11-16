import type { Metadata } from "next";
import Link from "next/link";
import { CampaignBuilder } from "@/components/admin/CampaignBuilder";
import { adminRoutes } from "@/components/admin/nav";
import { AppMain } from "@/components/app/PageHeader";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "New campaign" };

/** design/screens/AdminCampaign.dc.html */
export default async function AdminCampaignPage() {
  await requireAdmin();
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
    </AppMain>
  );
}
