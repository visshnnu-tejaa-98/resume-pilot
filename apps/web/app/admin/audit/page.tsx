import { adminAuditLog } from "@resume-pilot/services";
import type { Metadata } from "next";
import { AdminCard, AdminTable, EmptyRow, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { Select } from "@/components/ui/Field";
import { fmtDateTime, maskEmail, shortId } from "@/lib/admin-format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Audit log" };

const ACTIONS: { prefix: string; label: string; status: string }[] = [
  { prefix: "credits", label: "Credit adjustment", status: "captured" },
  { prefix: "user.suspend", label: "Suspension", status: "failed" },
  { prefix: "user.reinstate", label: "Reinstatement", status: "active" },
  { prefix: "coupon", label: "Coupon change", status: "skipped" },
  { prefix: "referral", label: "Referral review", status: "held" },
  { prefix: "pricing", label: "Config change", status: "skipped" },
  { prefix: "email_template", label: "Email template", status: "skipped" },
  { prefix: "resume_template", label: "Resume template", status: "skipped" },
];

const describe = (action: string) => ACTIONS.find((a) => action.startsWith(a.prefix)) ?? { label: action, status: "skipped" };

/** design/screens/AdminAudit.dc.html — read-only. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  await requireAdmin();
  const { action } = await searchParams;
  const filter = ACTIONS.find((a) => a.prefix === action)?.prefix;
  const rows = await adminAuditLog(getDb(), { action: filter, limit: 200 });

  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-display text-[28px] font-bold">Audit log</h1>
        <span className="text-sm text-text-2">Read-only. Every admin action, with who did it and why.</span>
      </div>
      <form method="get" className="flex items-center gap-2 text-sm text-text-2">
        <label htmlFor="audit-action">Action</label>
        <Select id="audit-action" name="action" fieldSize="sm" defaultValue={filter ?? ""} className="w-auto bg-surface">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a.prefix} value={a.prefix}>
              {a.label}
            </option>
          ))}
        </Select>
        <button type="submit" className="h-10 cursor-pointer rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-text">
          Apply
        </button>
      </form>
      <AdminCard className="overflow-hidden">
        <AdminTable head={["Time", "Admin", "Action", "Target", "Reason"]} minWidth={880}>
          {rows.length === 0 ? (
            <EmptyRow cols={5}>No admin actions recorded.</EmptyRow>
          ) : (
            rows.map((r) => {
              const a = describe(r.action);
              const meta = r.metadata as Record<string, unknown> | null;
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[13px] whitespace-nowrap text-text-2">{fmtDateTime(r.createdAt)}</td>
                  <td>{maskEmail(r.adminEmail)}</td>
                  <td>
                    <StatusPill status={a.status} label={a.label} />
                  </td>
                  <td className="font-mono text-[13px] text-text-2">
                    {r.targetType ?? "—"} {r.targetId ? shortId(r.targetId) : ""}
                    {meta && "credits" in meta ? ` · ${Number(meta.credits) > 0 ? "+" : ""}${String(meta.credits)}` : ""}
                  </td>
                  <td className="max-w-[420px] text-[13px] leading-normal">{r.reason}</td>
                </tr>
              );
            })
          )}
        </AdminTable>
      </AdminCard>
    </AppMain>
  );
}
