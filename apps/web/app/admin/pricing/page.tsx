import { adminListCreditPackages, adminOverview, getActivePricingConfig, listPricingConfigs } from "@resume-pilot/services";
import type { Metadata } from "next";
import { CreditPacksManager } from "@/components/admin/CreditPacksManager";
import { PricingEditor } from "@/components/admin/PricingEditor";
import { AdminCard, AdminTable, CardHeader, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { fmtDate } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Pricing config" };

/** design/screens/AdminPricing.dc.html */
export default async function AdminPricingPage() {
  await requireAdmin();
  const db = getDb();
  const [active, versions, packs, overview] = await Promise.all([
    getActivePricingConfig(db).catch(() => null),
    listPricingConfigs(db),
    adminListCreditPackages(db),
    adminOverview(db, 14),
  ]);
  const avgCostPaise = Object.fromEntries(overview.econ.map((e) => [e.type, e.avgCostPaise]));

  return (
    <AppMain className="gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[28px] font-bold">Pricing config</h1>
        <span className="text-sm text-text-2">
          {active ? (
            <>
              Live: <strong className="text-text">v{active.version}</strong> since {fmtDate(active.createdAt)}. Saving creates v{active.version + 1}; every charge records the
              version it used.
            </>
          ) : (
            "No active pricing config — seed one before any paid action can run."
          )}
        </span>
      </div>

      {active ? (
        <PricingEditor
          version={active.version}
          config={{
            modelPrices: active.modelPrices,
            actionSettings: active.actionSettings,
            usdToInrRate: active.usdToInrRate,
            markupMultiplier: active.markupMultiplier,
            minimumCreditsPerAction: active.minimumCreditsPerAction,
            creditValueInr: active.creditValueInr,
          }}
          avgCostPaise={avgCostPaise}
        />
      ) : null}

      <CreditPacksManager packs={packs} />

      <AdminCard className="overflow-hidden">
        <CardHeader title="Version history" />
        <AdminTable head={["Version", "Markup", "Credit value", "USD→INR", "Minimum", "Note", "Created"]} minWidth={760}>
          {versions.map((v) => (
            <tr key={v.id}>
              <td className="font-mono font-semibold">
                v{v.version} {v.active ? <StatusPill status="active" label="Live" /> : null}
              </td>
              <td className="font-mono">{v.markupMultiplier.toFixed(1)}×</td>
              <td className="font-mono">₹{v.creditValueInr}</td>
              <td className="font-mono">{v.usdToInrRate}</td>
              <td className="font-mono">{v.minimumCreditsPerAction}</td>
              <td className="max-w-[320px] text-[13px] text-text-2">{v.note ?? "—"}</td>
              <td className="whitespace-nowrap text-text-2">{fmtDate(v.createdAt)}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminCard>
    </AppMain>
  );
}
