import { adminLedger } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, EmptyRow, Kpi, KpiGrid, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { cn } from "@/lib/cn";
import { fmtCompact, fmtDateTime, maskEmail, shortId } from "@/lib/admin-format";
import { fmtCredits, fmtSignedCredits } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Credit ledger" };

const TYPE_LABEL: Record<string, { label: string; status: string }> = {
  purchase: { label: "Purchase", status: "captured" },
  coupon_credit: { label: "Coupon", status: "captured" },
  referral_credit: { label: "Referral", status: "captured" },
  capture: { label: "Capture", status: "skipped" },
  refund: { label: "Refund", status: "failed" },
  admin_adjustment: { label: "Admin", status: "held" },
};

/** design/screens/AdminLedger.dc.html */
export default async function AdminLedgerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const tab = (await searchParams).tab === "holds" ? "holds" : "entries";
  const { entries, byType, holds } = await adminLedger(getDb(), 100);
  const t = (k: string) => byType[k] ?? 0;
  const outstanding = Object.values(byType).reduce((a, b) => a + b, 0);

  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[28px] font-bold">Credit ledger</h1>
        <span className="text-sm text-text-2">Append-only. Every row links to a payment, AI job, code or admin action.</span>
      </div>

      <KpiGrid min={150}>
        <Kpi label="Purchased" value={fmtCompact(t("purchase"))} />
        <Kpi label="From codes" value={fmtCompact(t("coupon_credit") + t("referral_credit"))} />
        <Kpi label="Admin adjustments" value={fmtCompact(t("admin_adjustment"))} />
        <Kpi label="Consumed" value={fmtCompact(-t("capture"))} />
        <Kpi label="Refunded" value={fmtCompact(-t("refund"))} />
        <Kpi label="Outstanding" value={fmtCompact(outstanding)} tone="warn" />
      </KpiGrid>

      <div role="tablist" aria-label="Ledger view" className="flex gap-1 border-b border-border">
        {[
          ["entries", "Entries"],
          ["holds", `Active holds · ${holds.length}`],
        ].map(([id, label]) => (
          <Link
            key={id}
            role="tab"
            aria-selected={tab === id}
            href={id === "entries" ? adminRoutes.ledger : `${adminRoutes.ledger}?tab=holds`}
            className={cn(
              "-mb-px border-b-[3px] px-4 py-3 text-sm font-semibold no-underline",
              tab === id ? "border-accent text-text" : "border-transparent text-text-2 hover:text-text",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <AdminCard className="overflow-hidden">
        {tab === "entries" ? (
          <AdminTable head={["Time", "User", "Type", "Source", "Credits", "Balance after"]} minWidth={860}>
            {entries.length === 0 ? (
              <EmptyRow cols={6}>No ledger entries yet.</EmptyRow>
            ) : (
              entries.map((e) => {
                const ty = TYPE_LABEL[e.type] ?? { label: e.type, status: "skipped" };
                return (
                  <tr key={e.id}>
                    <td className="font-mono text-[13px] whitespace-nowrap text-text-2">{fmtDateTime(e.createdAt)}</td>
                    <td>
                      <Link href={adminRoutes.user(e.userId)} className="text-text hover:underline">
                        {maskEmail(e.userEmail)}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={ty.status} label={ty.label} />
                    </td>
                    <td className="font-mono text-[13px] text-text-2">
                      {e.sourceType === "ai_job" ? (
                        <Link href={adminRoutes.aiJob(e.sourceId)} className="text-link">
                          {shortId(e.sourceId, "job_")}
                        </Link>
                      ) : (
                        `${e.sourceType} ${shortId(e.sourceId)}`
                      )}
                      {e.note ? <span className="font-sans"> · {e.note}</span> : null}
                    </td>
                    <td className={cn("text-right font-mono font-semibold", e.credits > 0 ? "text-good" : "text-text")}>{fmtSignedCredits(e.credits)}</td>
                    <td className="text-right font-mono text-text-2">{fmtCredits(e.balanceAfter)}</td>
                  </tr>
                );
              })
            )}
          </AdminTable>
        ) : (
          <AdminTable head={["Hold", "User", "AI job", "Credits", "Auto-release"]} minWidth={720}>
            {holds.length === 0 ? (
              <EmptyRow cols={5}>No active holds.</EmptyRow>
            ) : (
              holds.map((h) => {
                const mins = Math.round((+new Date(h.expiresAt) - Date.now()) / 60000);
                return (
                  <tr key={h.id}>
                    <td className="font-mono text-[13px]">{shortId(h.id, "hold_")}</td>
                    <td>{maskEmail(h.userEmail)}</td>
                    <td>
                      <Link href={adminRoutes.aiJob(h.aiJobId)} className="font-mono text-[13px] text-link">
                        {shortId(h.aiJobId, "job_")}
                      </Link>
                    </td>
                    <td className="font-mono">{fmtCredits(h.amount)}</td>
                    <td className={cn("text-[13px]", mins < 0 ? "text-crit" : "text-text-2")}>{mins < 0 ? `overdue by ${-mins} min` : `in ${mins} min`}</td>
                  </tr>
                );
              })
            )}
          </AdminTable>
        )}
      </AdminCard>
    </AppMain>
  );
}
