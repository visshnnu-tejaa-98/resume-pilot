import { adminEmailLog } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, EmptyRow, FilterChips, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { fmtDateTime, maskEmail } from "@/lib/admin-format";
import { templateName } from "@/content/email-templates";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Email log" };

const STATUSES = ["sent", "delivered", "opened", "clicked", "bounced", "failed", "unsubscribed", "skipped", "queued"] as const;

/** design/screens/AdminEmailLog.dc.html — last 7 days, recipients masked. */
export default async function AdminEmailLogPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const { rows, counts } = await adminEmailLog(getDb(), { status, q: sp.q?.trim() || undefined, limit: 200 });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (s?: string) => {
    const u = new URLSearchParams();
    if (s) u.set("status", s);
    if (sp.q) u.set("q", sp.q);
    const q = u.toString();
    return q ? `${adminRoutes.emailLog}?${q}` : adminRoutes.emailLog;
  };

  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[28px] font-bold">Email log</h1>
        <span className="text-sm text-text-2">Every email sent in the last 7 days, with its delivery status. Kept for [RETENTION PERIOD].</span>
      </div>
      <form method="get" className="flex max-w-[460px]">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <SearchField name="q" label="Search by email or message ID" placeholder="Search email or message ID" defaultValue={sp.q} className="flex-1" />
      </form>
      <FilterChips
        items={[
          { href: href(), label: "All", count: total, on: !status },
          ...STATUSES.filter((s) => counts[s]).map((s) => ({ href: href(s), label: s.charAt(0).toUpperCase() + s.slice(1), count: counts[s], on: status === s })),
        ]}
      />
      <AdminCard className="overflow-hidden">
        <AdminTable head={["Time (IST)", "Recipient", "Template", "Status", "Detail", "Message ID"]} minWidth={900}>
          {rows.length === 0 ? (
            <EmptyRow cols={6}>No emails{status ? ` with status “${status}”` : ""} in the last 7 days.</EmptyRow>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-[13px] whitespace-nowrap text-text-2">{fmtDateTime(r.createdAt)}</td>
                <td>
                  <Link href={adminRoutes.user(r.userId)} className="text-link">
                    {maskEmail(r.email)}
                  </Link>
                </td>
                <td>{templateName(r.templateKey)}</td>
                <td>
                  <StatusPill status={r.status} />
                </td>
                <td className="max-w-[280px] text-[13px] text-text-2">{r.error ?? "—"}</td>
                <td className="font-mono text-xs text-text-2">{r.providerMessageId ?? "—"}</td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>
      <span className="text-[13px] text-text-2">
        Recipients are masked. Open the user to see the account. Showing {rows.length} of {total.toLocaleString("en-IN")}.
      </span>
    </AppMain>
  );
}
