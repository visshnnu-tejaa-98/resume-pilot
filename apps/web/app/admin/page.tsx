import { adminInsights, adminOverview, getActivePricingConfig } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionsChart } from "@/components/admin/ActionsChart";
import { AdminCard, AdminTable, CardHeader, EmptyRow, Kpi, KpiGrid } from "@/components/admin/ui";
import { adminRoutes } from "@/components/admin/nav";
import { AppMain } from "@/components/app/PageHeader";
import { cn } from "@/lib/cn";
import { aiTypeLabel, fmtCompact, fmtCompactInr, fmtPaise, pct } from "@/lib/admin-format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Overview" };

const PERIODS = [7, 14, 30] as const;

/** design/screens/AdminOverview.dc.html */
export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const { days: rawDays } = await searchParams;
  const days = PERIODS.find((p) => String(p) === rawDays) ?? 14;
  const db = getDb();
  const [o, pricing, x] = await Promise.all([adminOverview(db, days), getActivePricingConfig(db).catch(() => null), adminInsights(db, days)]);
  const issued = x.credits.issued;
  const issuedTotal = issued.purchased + issued.coupon + issued.referral + issued.admin;
  const creditValue = pricing ? Number(pricing.creditValueInr) : 0.05;

  const alerts = [
    o.alerts.failedLast24h > 0 && {
      h: `${o.alerts.failedLast24h} AI job${o.alerts.failedLast24h === 1 ? "" : "s"} failed in 24h`,
      p: "Failed runs release their holds; check for patterns",
      dot: "bg-crit",
      href: `${adminRoutes.aiJobs}?status=failed`,
    },
    o.alerts.flaggedReferrals > 0 && {
      h: `${o.alerts.flaggedReferrals} referral${o.alerts.flaggedReferrals === 1 ? "" : "s"} flagged`,
      p: "Referrer credit held until reviewed",
      dot: "bg-warn",
      href: adminRoutes.coupons,
    },
    o.alerts.pendingPayments > 0 && {
      h: `${o.alerts.pendingPayments} payment${o.alerts.pendingPayments === 1 ? "" : "s"} pending`,
      p: "Waiting for the Razorpay webhook",
      dot: "bg-link",
      href: adminRoutes.payments,
    },
  ].filter(Boolean) as { h: string; p: string; dot: string; href: string }[];

  return (
    <AppMain className="gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 font-display text-[28px] font-bold">Overview</h1>
        <div role="tablist" aria-label="Period" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              role="tab"
              aria-selected={p === days}
              href={`${adminRoutes.overview}?days=${p}`}
              className={cn(
                "flex h-8 items-center rounded-md px-3 text-[13px] no-underline",
                p === days ? "bg-surface font-semibold text-text shadow-sm" : "font-medium text-text-2 hover:text-text",
              )}
            >
              {p} days
            </Link>
          ))}
        </div>
      </div>

      <KpiGrid>
        <Kpi label="Users" value={fmtCompact(o.users)} sub={`+${o.newUsers} this period`} tone="good" />
        <Kpi label="Paying users" value={fmtCompact(o.payingUsers)} sub={`${pct(o.payingUsers, o.users, 0)} of users`} />
        <Kpi label="AI actions" value={fmtCompact(o.aiActions)} sub={`${pct(o.aiFailed, o.aiActions)} failed, 0 charged`} />
        <Kpi label="Top-up revenue" value={fmtCompactInr(o.revenuePaise)} sub={`${o.paymentsCount} payments`} />
        <Kpi
          label="AI cost"
          value={fmtCompactInr(o.aiCostPaise)}
          sub={o.revenuePaise ? `${pct(o.aiCostPaise, o.revenuePaise)} of revenue` : "No revenue yet"}
          tone={o.revenuePaise && o.aiCostPaise / o.revenuePaise > 0.2 ? "warn" : "good"}
        />
        <Kpi
          label="Outstanding credits"
          value={fmtCompact(o.outstandingCredits)}
          sub={`≈ ${fmtCompactInr(o.outstandingCredits * creditValue * 100)} liability`}
          tone="warn"
        />
      </KpiGrid>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" }}>
        <AdminCard className="flex flex-col gap-3 p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 font-display text-lg font-bold">AI actions per day</h2>
            <span className="flex gap-4 text-xs text-text-2">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-link" />
                Succeeded
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-accent" />
                Failed (no charge)
              </span>
            </span>
          </div>
          <ActionsChart data={o.daily} days={days} />
        </AdminCard>
        <AdminCard className="flex flex-col">
          <CardHeader
            title={
              <>
                Needs attention <span className="font-mono text-sm text-crit">{alerts.length}</span>
              </>
            }
          />
          {alerts.length === 0 ? (
            <p className="m-0 border-t border-border px-5 py-4 text-sm text-text-2">Nothing needs attention right now.</p>
          ) : (
            alerts.map((a) => (
              <Link key={a.h} href={a.href} className="flex gap-3 border-t border-border px-5 py-3.5 text-text no-underline hover:bg-surface-2">
                <span className={cn("mt-1.5 size-2 flex-none rounded-full", a.dot)} />
                <span className="flex flex-col gap-0.5">
                  <strong className="text-sm">{a.h}</strong>
                  <span className="text-[13px] text-text-2">{a.p}</span>
                </span>
              </Link>
            ))
          )}
        </AdminCard>
      </div>

      <AdminCard className="overflow-hidden">
        <CardHeader
          title="Unit economics by action"
          aside={
            pricing ? (
              <span className="font-mono text-xs text-text-2">
                1 credit = ₹{creditValue.toFixed(2)} · markup {Number(pricing.markupMultiplier).toFixed(1)}× · pricing v{pricing.version}
              </span>
            ) : null
          }
        />
        <AdminTable head={["Action", "Runs", "Avg tokens", "Avg AI cost", "Avg credits", "Credit value", "Margin"]}>
          {o.econ.length === 0 ? (
            <EmptyRow cols={7}>No successful AI actions in this period.</EmptyRow>
          ) : (
            o.econ.map((e) => {
              const valuePaise = e.avgCredits * creditValue * 100;
              const margin = valuePaise > 0 ? 1 - e.avgCostPaise / valuePaise : 0;
              return (
                <tr key={e.type}>
                  <td className="font-semibold">{aiTypeLabel(e.type)}</td>
                  <td className="font-mono">{e.runs.toLocaleString("en-IN")}</td>
                  <td className="font-mono">{e.avgTokens.toLocaleString("en-IN")}</td>
                  <td className="font-mono">{fmtPaise(e.avgCostPaise, 2)}</td>
                  <td className="font-mono">{Math.round(e.avgCredits).toLocaleString("en-IN")}</td>
                  <td className="font-mono">{fmtPaise(valuePaise, 2)}</td>
                  <td className={cn("font-mono font-semibold", margin >= 0.5 ? "text-good" : "text-warn")}>{Math.round(margin * 100)}%</td>
                </tr>
              );
            })
          )}
        </AdminTable>
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <CardHeader title="AI reliability" aside={<span className="text-xs text-text-2">Failed runs are never charged; their holds are released.</span>} />
        <AdminTable head={["Action", "Runs", "Success", "Failed", "Avg latency", "Credits charged", "AI cost"]} minWidth={720}>
          {x.byType.length === 0 ? (
            <EmptyRow cols={7}>No AI actions in this period.</EmptyRow>
          ) : (
            x.byType.map((t) => (
              <tr key={t.type}>
                <td className="font-semibold">{aiTypeLabel(t.type)}</td>
                <td className="font-mono">{t.total.toLocaleString("en-IN")}</td>
                <td className={cn("font-mono", t.total && t.succeeded / t.total < 0.95 ? "text-warn" : "text-good")}>{pct(t.succeeded, t.total)}</td>
                <td className="font-mono">{t.failed.toLocaleString("en-IN")}</td>
                <td className="font-mono">{(t.avgLatencyMs / 1000).toFixed(1)} s</td>
                <td className="font-mono">{t.creditsCharged.toLocaleString("en-IN")}</td>
                <td className="font-mono">{fmtPaise(t.costPaise)}</td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>

      <KpiGrid min={220}>
        <Kpi
          label="Grounding violations"
          value={`${x.grounding.perHundred} / 100`}
          sub={`${x.grounding.violations} in ${x.grounding.generations} generations · ${x.grounding.fixedByRetry} fixed by retry · ${x.grounding.blocked} blocked`}
          tone={x.grounding.blocked > 0 ? "warn" : "good"}
        />
        <Kpi label="Refunds" value={fmtCompactInr(x.refunds.paise)} sub={`${x.refunds.count} refund${x.refunds.count === 1 ? "" : "s"} · net ${fmtCompactInr(o.revenuePaise - x.refunds.paise)}`} />
        <Kpi label="Credits issued" value={fmtCompact(issuedTotal)} sub={`${fmtCompact(x.credits.consumed)} consumed by AI · ${fmtCompact(x.credits.refunded)} refunded`} />
        <Kpi label="Email, last 30 days" value={x.email.sent.toLocaleString("en-IN")} sub={`${x.email.failed} failed · ${x.email.hardBounced} hard-bounced · ${x.email.unsubscribed} unsubscribed`} tone={x.email.failed + x.email.hardBounced > 0 ? "warn" : undefined} />
      </KpiGrid>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))" }}>
        <AdminCard className="overflow-hidden">
          <CardHeader title="Credits issued vs consumed" />
          <AdminTable head={["Source", "Credits", "Share"]} minWidth={360}>
            {[
              ["Purchased", issued.purchased],
              ["Coupons", issued.coupon],
              ["Referrals", issued.referral],
              ["Admin grants", issued.admin],
            ].map(([k, v]) => (
              <tr key={k as string}>
                <td>{k}</td>
                <td className="font-mono">+{(v as number).toLocaleString("en-IN")}</td>
                <td className="font-mono text-text-2">{pct(v as number, issuedTotal, 0)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-semibold">Consumed by AI</td>
              <td className="font-mono">−{x.credits.consumed.toLocaleString("en-IN")}</td>
              <td />
            </tr>
            <tr>
              <td className="font-semibold">Refunded / admin removed</td>
              <td className="font-mono">−{(x.credits.refunded + x.credits.adminRemoved).toLocaleString("en-IN")}</td>
              <td />
            </tr>
          </AdminTable>
          <p className="m-0 border-t border-border px-5 py-3 text-xs text-text-2">
            Outstanding liability across all wallets: {fmtCompact(o.outstandingCredits)} credits (≈ {fmtCompactInr(o.outstandingCredits * creditValue * 100)}).
          </p>
        </AdminCard>
        <AdminCard className="overflow-hidden">
          <CardHeader title="Signups per day" aside={<span className="text-xs text-text-2">{o.newUsers} in {days} days</span>} />
          {x.signups.length === 0 ? (
            <p className="m-0 border-t border-border px-5 py-4 text-sm text-text-2">No signups in this period.</p>
          ) : (
            <div className="flex h-[150px] items-end gap-1 border-t border-border px-5 pt-4 pb-3" role="img" aria-label={`Signups per day: ${x.signups.map((d) => `${d.day} ${d.n}`).join(", ")}`}>
              {x.signups.map((d) => {
                const max = Math.max(...x.signups.map((s) => s.n));
                return <span key={d.day} title={`${d.day}: ${d.n}`} className="min-w-[4px] flex-1 rounded-t-sm bg-link" style={{ height: `${Math.max(4, (d.n / max) * 100)}%` }} />;
              })}
            </div>
          )}
        </AdminCard>
      </div>
    </AppMain>
  );
}
