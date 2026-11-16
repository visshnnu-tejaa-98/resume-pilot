import { adminOverview, getActivePricingConfig, listActiveCreditPackages, listPricingConfigs } from "@resume-pilot/services";
import type { Metadata } from "next";
import { PricingEditor } from "@/components/admin/PricingEditor";
import { AdminCard, AdminTable, CardHeader, EmptyRow, NotWiredNote, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { fmtPaise } from "@/lib/admin-format";
import { fmtCredits, fmtDate } from "@/lib/format";
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
    listActiveCreditPackages(db),
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

      <AdminCard className="overflow-hidden">
        <CardHeader title="Top-up packs" />
        <AdminTable head={["Price", "Credits", "Bonus", "Per credit", "Status"]} minWidth={520}>
          {packs.length === 0 ? (
            <EmptyRow cols={5}>No active packs.</EmptyRow>
          ) : (
            packs.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{fmtPaise(p.pricePaise)}</td>
                <td className="font-mono">{fmtCredits(p.credits)}</td>
                <td className="font-mono">{p.bonusCredits ? `+${fmtCredits(p.bonusCredits)}` : "—"}</td>
                <td className="font-mono">₹{(p.pricePaise / 100 / (p.credits + p.bonusCredits)).toFixed(3)}</td>
                <td>
                  <StatusPill status="active" />
                </td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>
      <NotWiredNote>Adding or editing top-up packs from here arrives with payments (m10). Packs live in the credit_packages table meanwhile.</NotWiredNote>

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
