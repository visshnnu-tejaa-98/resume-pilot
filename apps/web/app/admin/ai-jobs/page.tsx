import { adminListAiJobs } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, EmptyRow, FilterChips, StatusPill } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { aiTypeLabel, fmtDateTime, fmtDuration, fmtPaise, maskEmail, shortId } from "@/lib/admin-format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "AI jobs and logs" };

const STATUSES = ["running", "failed", "succeeded"] as const;
const TYPES = ["generation", "ats_scoring", "jd_analysis"] as const;

/** design/screens/AdminAiJobs.dc.html */
export default async function AdminAiJobsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const type = TYPES.find((t) => t === sp.type);
  const { rows, running, waiting } = await adminListAiJobs(getDb(), { status, type, limit: 100 });

  const href = (s?: string) => {
    const u = new URLSearchParams();
    if (s) u.set("status", s);
    if (type) u.set("type", type);
    const q = u.toString();
    return q ? `${adminRoutes.aiJobs}?${q}` : adminRoutes.aiJobs;
  };

  return (
    <AppMain className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-display text-[28px] font-bold">AI jobs and logs</h1>
        <span className="text-sm text-text-2">
          Queue:{" "}
          <strong className="text-text">
            {running} running · {waiting} waiting
          </strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          items={[
            { href: href(), label: "All", on: !status },
            { href: href("running"), label: "Running", on: status === "running" },
            { href: href("failed"), label: "Failed", on: status === "failed" },
            { href: href("succeeded"), label: "Succeeded", on: status === "succeeded" },
          ]}
        />
        <form method="get" className="ml-auto flex items-center gap-2 text-sm text-text-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="ai-type">Type</label>
          <Select id="ai-type" name="type" fieldSize="sm" defaultValue={type ?? ""} className="w-auto bg-surface">
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {aiTypeLabel(t)}
              </option>
            ))}
          </Select>
          <button type="submit" className="h-10 cursor-pointer rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-text">
            Apply
          </button>
        </form>
      </div>

      <AdminCard className="overflow-hidden">
        <AdminTable head={["Job", "Type", "User", "Status", "Tokens in / out", "AI cost", "Credits est / charged", "Time", "Note"]} minWidth={1100}>
          {rows.length === 0 ? (
            <EmptyRow cols={9}>No AI jobs match.</EmptyRow>
          ) : (
            rows.map((r) => {
              const live = r.status === "running" || r.status === "pending";
              return (
                <tr key={r.id} className={cn(r.status === "failed" && "bg-warn-bg/40")}>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <Link href={adminRoutes.aiJob(r.id)} className="font-mono font-semibold text-link">
                        {shortId(r.id, "job_")}
                      </Link>
                      <span className="text-xs whitespace-nowrap text-text-2">{fmtDateTime(r.createdAt)}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{aiTypeLabel(r.type)}</td>
                  <td>
                    <Link href={adminRoutes.user(r.userId)} className="text-text hover:underline">
                      {maskEmail(r.userEmail)}
                    </Link>
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className="font-mono whitespace-nowrap">
                    {r.inputTokens?.toLocaleString("en-IN") ?? "—"} / {r.outputTokens?.toLocaleString("en-IN") ?? "—"}
                  </td>
                  <td className="font-mono">{r.costPaise != null ? fmtPaise(r.costPaise, 2) : "—"}</td>
                  <td className="font-mono whitespace-nowrap">
                    {r.creditsEstimated} / {live ? "held" : (r.creditsCharged ?? 0)}
                  </td>
                  <td className="font-mono whitespace-nowrap">{live ? "—" : fmtDuration(r.durationMs)}</td>
                  <td className={cn("max-w-[260px] truncate text-[13px]", r.error ? "text-crit" : "text-text-2")} title={r.error ?? undefined}>
                    {r.error ?? "—"}
                  </td>
                </tr>
              );
            })
          )}
        </AdminTable>
      </AdminCard>
      <span className="text-[13px] text-text-2">Failed jobs always show 0 charged; their holds are released in full.</span>
    </AppMain>
  );
}
