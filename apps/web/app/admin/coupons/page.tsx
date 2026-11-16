import { adminReferralStats, listCoupons, listFlaggedReferrals } from "@resume-pilot/services";
import type { Metadata } from "next";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { Kpi, KpiGrid } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { fmtCompact } from "@/lib/admin-format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Coupons and referrals" };

/** design/screens/AdminCoupons.dc.html */
export default async function AdminCouponsPage() {
  await requireAdmin();
  const db = getDb();
  const [coupons, flagged, stats] = await Promise.all([listCoupons(db), listFlaggedReferrals(db), adminReferralStats(db)]);

  return (
    <AppMain className="gap-6">
      <h1 className="m-0 font-display text-[28px] font-bold">Coupons and referrals</h1>
      <KpiGrid>
        <Kpi label="Referral sign-ups" value={fmtCompact(stats.signups)} />
        <Kpi label="Credits granted" value={fmtCompact(stats.creditsGranted)} sub="Friends + referrers" />
        <Kpi label="Active referrers" value={fmtCompact(stats.activeReferrers)} />
        <Kpi label="Flagged" value={flagged.length} tone={flagged.length ? "warn" : undefined} />
      </KpiGrid>
      <CouponsManager coupons={coupons} flagged={flagged} />
    </AppMain>
  );
}
