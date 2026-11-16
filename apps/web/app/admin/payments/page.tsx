import { adminPayments } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, EmptyRow, Kpi, KpiGrid, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtPaise, maskEmail } from "@/lib/admin-format";
import { fmtCredits } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Payments and refunds" };

/** design/screens/AdminPayments.dc.html — row selection via ?sel= so it's linkable. */
export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ sel?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { rows: all, events, stats } = await adminPayments(getDb(), 100);
  const q = sp.q?.trim().toLowerCase();
  const rows = q ? all.filter((r) => r.orderId.toLowerCase().includes(q) || r.paymentId?.toLowerCase().includes(q)) : all;
  const sel = rows.find((r) => r.id === sp.sel) ?? rows[0];
  const selEvents = sel ? events.filter((e) => e.paymentId === sel.id) : [];
  const s = (k: string) => stats[k] ?? { n: 0, paise: 0 };

  return (
    <AppMain className="gap-5">
      <h1 className="m-0 font-display text-[28px] font-bold">Payments and refunds</h1>
      <KpiGrid>
        <Kpi label="Collected" value={fmtPaise(s("captured").paise)} sub={`${s("captured").n} payments`} />
        <Kpi label="Failed" value={s("failed").n} sub="No credits granted" />
        <Kpi label="Pending" value={s("created").n} sub="Waiting for webhook" />
        <Kpi label="Refunds" value={fmtPaise(s("refunded").paise)} sub={`${s("refunded").n} refunds`} />
      </KpiGrid>
      {q ? (
        <span className="text-sm text-text-2">
          Filtered by “{sp.q}” · <Link href={adminRoutes.payments} className="text-link">clear</Link>
        </span>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        <AdminCard className="min-w-0 flex-[999_1_560px] overflow-hidden">
          <AdminTable head={["Payment", "User", "Amount", "Credits", "Status"]} minWidth={640}>
            {rows.length === 0 ? (
              <EmptyRow cols={5}>No payments yet.</EmptyRow>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={cn(r.id === sel?.id && "bg-sel-bg")}>
                  <td>
                    <Link href={`${adminRoutes.payments}?sel=${r.id}${q ? `&q=${encodeURIComponent(sp.q!)}` : ""}`} scroll={false} className="flex flex-col gap-0.5 no-underline">
                      <span className="font-mono text-[13px] font-semibold text-link">{r.paymentId ?? r.orderId}</span>
                      <span className="text-xs text-text-2">{fmtDateTime(r.createdAt)}</span>
                    </Link>
                  </td>
                  <td>{maskEmail(r.userEmail)}</td>
                  <td className="font-mono">{fmtPaise(r.amountPaise)}</td>
                  <td className="font-mono">{fmtCredits(r.credits)}</td>
                  <td>
                    <StatusPill status={r.status} label={r.status === "created" ? "Pending" : undefined} />
                  </td>
                </tr>
              ))
            )}
          </AdminTable>
        </AdminCard>

        {sel ? (
          <aside aria-label="Payment detail" className="flex flex-[1_1_300px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-5 md:sticky md:top-24">
            <div className="flex items-center justify-between gap-2">
              <strong className="font-mono text-sm break-all">{sel.paymentId ?? sel.orderId}</strong>
              <StatusPill status={sel.status} label={sel.status === "created" ? "Pending" : undefined} />
            </div>
            {[
              ["User", <Link key="u" href={adminRoutes.user(sel.userId)} className="text-link">{maskEmail(sel.userEmail)}</Link>],
              ["Amount", `${fmtPaise(sel.amountPaise, 2)} · ${sel.amountPaise.toLocaleString("en-IN")} paise`],
              ["Order", sel.orderId],
              ["Credits", fmtCredits(sel.credits)],
              ["Time", fmtDateTime(sel.createdAt)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 text-sm">
                <span className="text-text-2">{k}</span>
                <span className="text-right font-mono text-[13px] break-all">{v}</span>
              </div>
            ))}
            <strong className="mt-1 border-t border-border pt-3 text-sm">Webhook events</strong>
            {selEvents.length === 0 ? (
              <span className="text-[13px] text-text-2">No webhook events recorded.</span>
            ) : (
              selEvents.map((e, i) => {
                const dup = selEvents.findIndex((x) => x.eventType === e.eventType) !== i;
                return (
                  <div key={i} className="flex justify-between gap-3 text-[13px]">
                    <span className="font-mono">{e.eventType}</span>
                    <span className={dup ? "text-warn" : "text-text-2"}>{dup ? "duplicate · ignored" : fmtDateTime(e.createdAt)}</span>
                  </div>
                );
              })
            )}
            {sel.status === "captured" ? (
              <p className="m-0 rounded-lg bg-surface-2 p-3 text-xs leading-normal text-text-2">
                Refunds of unused purchased credits are issued through Razorpay with the payments work (m10); credits are debited before the refund.
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </AppMain>
  );
}
