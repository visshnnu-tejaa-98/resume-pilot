import { adminGetUser, adminUserExtras } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, CardHeader, EmptyRow, Kpi, KpiGrid, StatusPill } from "@/components/admin/ui";
import { UserActions } from "@/components/admin/UserActions";
import { ViewResumeButton } from "@/components/admin/ViewResumeButton";
import { initialsOf } from "@/components/app/Avatar";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { cn } from "@/lib/cn";
import { aiTypeLabel, fmtDateTime, fmtDuration, fmtPaise, maskEmail, shortId } from "@/lib/admin-format";
import { ledgerLabel } from "@/lib/domain";
import { fmtCredits, fmtDate, fmtSignedCredits } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "User" };

/** design/screens/AdminUserDetail.dc.html — metadata by default; resume content only via a logged, reasoned view. */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { user: me } = await requireAdmin();
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const [d, x] = await Promise.all([adminGetUser(getDb(), userId), adminUserExtras(getDb(), userId)]);
  if (!d) notFound();
  const label = maskEmail(d.user.email);
  const failed = d.jobs.filter((j) => j.status === "failed").length;

  return (
    <AppMain className="gap-6">
      <PageHeader
        crumbs={[{ href: adminRoutes.users, label: "Users" }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-base font-bold">{initialsOf(d.user.email)}</span>
            {label}
            <StatusPill status={d.user.status} />
            {d.user.role === "admin" ? <StatusPill status="held" label="Admin" /> : null}
          </span>
        }
        subtitle={
          <span className="font-mono text-[13px]">
            {d.user.id} · joined {fmtDate(d.user.createdAt)}
          </span>
        }
        actions={<UserActions userId={d.user.id} label={label} balance={d.balance} status={d.user.status} isSelf={d.user.id === me.id} />}
      />

      <KpiGrid min={170}>
        <Kpi label="Balance" value={fmtCredits(d.balance)} sub={`${fmtCredits(d.held)} on hold`} />
        <Kpi label="Paid" value={fmtPaise(d.paidPaise)} sub={`${d.topups} top-up${d.topups === 1 ? "" : "s"}`} />
        <Kpi label="Credits used" value={fmtCredits(d.creditsUsed)} sub={`${d.chargedActions} charged action${d.chargedActions === 1 ? "" : "s"}`} />
        <Kpi label="AI jobs" value={d.jobs.length} sub={failed ? `${failed} failed, not charged` : "Recent"} />
        <Kpi
          label="Code used"
          value={<span className="text-lg">{d.redemption?.code ?? "—"}</span>}
          sub={d.redemption ? `+${fmtCredits(d.redemption.creditsToUser)} on ${fmtDate(d.redemption.createdAt)}` : "None"}
        />
      </KpiGrid>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <AdminCard className="overflow-hidden">
          <CardHeader title="Credit ledger" aside={<Link href={adminRoutes.ledger} className="text-sm font-semibold text-link">Full ledger</Link>} />
          <AdminTable head={["Entry", "Credits", "Balance"]} minWidth={420}>
            {d.ledger.length === 0 ? (
              <EmptyRow cols={3}>No credit activity.</EmptyRow>
            ) : (
              d.ledger.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span>{ledgerLabel({ type: l.type, action: null, note: l.note })}</span>
                      <span className="font-mono text-xs text-text-2">
                        {fmtDateTime(l.createdAt)} · {l.sourceType} {shortId(l.sourceId)}
                      </span>
                    </div>
                  </td>
                  <td className={cn("text-right font-mono font-semibold", l.credits > 0 ? "text-good" : "text-text")}>{fmtSignedCredits(l.credits)}</td>
                  <td className="text-right font-mono text-text-2">{fmtCredits(l.balanceAfter)}</td>
                </tr>
              ))
            )}
          </AdminTable>
        </AdminCard>

        <AdminCard className="overflow-hidden">
          <CardHeader title="AI jobs" aside={<Link href={adminRoutes.aiJobs} className="text-sm font-semibold text-link">All jobs</Link>} />
          <AdminTable head={["Job", "Status", "Time"]} minWidth={420}>
            {d.jobs.length === 0 ? (
              <EmptyRow cols={3}>No AI jobs yet.</EmptyRow>
            ) : (
              d.jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <Link href={adminRoutes.aiJob(j.id)} className="font-semibold text-link">
                        {aiTypeLabel(j.type)}
                      </Link>
                      <span className="font-mono text-xs text-text-2">
                        {shortId(j.id, "job_")} · {fmtDateTime(j.createdAt)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusPill status={j.status} />
                  </td>
                  <td className="text-right font-mono text-text-2">{j.status === "running" || j.status === "pending" ? "—" : fmtDuration(j.durationMs)}</td>
                </tr>
              ))
            )}
          </AdminTable>
        </AdminCard>
      </div>

      <AdminCard className="overflow-hidden">
        <CardHeader
          title="Resumes and versions"
          aside={
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Content hidden · every view is logged
            </span>
          }
        />
        <AdminTable head={["Version", "Kind", "Updated", ""]} minWidth={560}>
          {d.versions.length === 0 ? (
            <EmptyRow cols={4}>No resumes.</EmptyRow>
          ) : (
            d.versions.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.fileName} <span className="font-mono text-xs text-text-2">{shortId(v.id, "ver_")}</span>
                </td>
                <td className="capitalize">{v.kind}</td>
                <td className="text-text-2">{fmtDate(v.updatedAt)}</td>
                <td>
                  <ViewResumeButton userId={d.user.id} versionId={v.id} label={`${v.fileName} · ${v.kind}`} />
                </td>
              </tr>
            ))
          )}
        </AdminTable>
        <p className="m-0 border-t border-border px-5 py-3 text-xs text-text-2">
          Opening resume content needs a reason and writes an audit-log entry (action <code className="font-mono">resume.view_content</code>).
        </p>
      </AdminCard>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <AdminCard className="overflow-hidden">
          <CardHeader title="Payments and refunds" aside={<Link href={adminRoutes.payments} className="text-[13px] font-semibold text-link">All payments</Link>} />
          <AdminTable head={["Payment", "Amount", "Credits", "Status"]} minWidth={480}>
            {x.payments.length === 0 ? (
              <EmptyRow cols={4}>No payments.</EmptyRow>
            ) : (
              x.payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`${adminRoutes.payments}?sel=${p.id}`} className="font-mono text-[13px] text-link">
                      {p.paymentId ?? p.orderId}
                    </Link>
                    <div className="text-xs text-text-2">{fmtDateTime(p.createdAt)}</div>
                  </td>
                  <td className="font-mono">{fmtPaise(p.amountPaise)}</td>
                  <td className="font-mono">{fmtCredits(p.credits)}</td>
                  <td>
                    <StatusPill status={p.status} label={p.status === "created" ? "Pending" : undefined} />
                    {p.refundPaise ? <div className="text-xs text-text-2">Refund {fmtPaise(p.refundPaise, 2)} · {p.refundStatus}</div> : null}
                  </td>
                </tr>
              ))
            )}
          </AdminTable>
        </AdminCard>

        <AdminCard className="flex flex-col gap-3 p-5">
          <strong className="font-display text-base">Email</strong>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-2">Address</span>
            <span className="font-mono text-[13px] break-all">{d.user.email}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-2">Delivery</span>
            {x.suppression ? (
              <span className={x.suppression.reason === "hard_bounce" ? "font-semibold text-crit" : "text-warn"}>
                {x.suppression.reason === "hard_bounce" ? "Hard bounce: no email at all" : x.suppression.reason === "complaint" ? "Complaint: no marketing" : "Unsubscribed from all marketing"} · {fmtDate(x.suppression.createdAt)}
              </span>
            ) : (
              <span className="text-good">OK</span>
            )}
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text-2">Marketing</span>
            <span>
              {x.prefs ? `Reminders ${x.prefs.reminders ? "on" : "off"} · Product updates ${x.prefs.productUpdates ? "on" : "off"}` : "No consent recorded"}
            </span>
          </div>
          <strong className="mt-1 border-t border-border pt-3 text-sm">Recent emails</strong>
          {x.recentEmail.length === 0 ? (
            <span className="text-[13px] text-text-2">None yet.</span>
          ) : (
            x.recentEmail.map((m, i) => (
              <div key={i} className="flex justify-between gap-3 text-[13px]">
                <span className="font-mono">{m.templateKey}</span>
                <span className={cn(m.status === "failed" ? "text-crit" : "text-text-2")} title={m.error ?? undefined}>
                  {m.status} · {fmtDateTime(m.createdAt)}
                </span>
              </div>
            ))
          )}
        </AdminCard>
      </div>
    </AppMain>
  );
}
