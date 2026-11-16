import { adminListUsers } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, EmptyRow, StatusPill } from "@/components/admin/ui";
import { initialsOf } from "@/components/app/Avatar";
import { AppMain } from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SearchField } from "@/components/ui/SearchField";
import { maskEmail } from "@/lib/admin-format";
import { fmtCredits, fmtDate } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Users" };

const PAGE = 25;

type SP = { q?: string; status?: string; payer?: string; page?: string };

/** design/screens/AdminUsers.dc.html — filters are a plain GET form, so URLs are shareable. */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const payer = sp.payer === "yes" || sp.payer === "no" ? sp.payer : undefined;
  const { rows, total } = await adminListUsers(getDb(), { q: sp.q?.trim() || undefined, status, payer, limit: PAGE, offset: (page - 1) * PAGE });

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.q) u.set("q", sp.q);
    if (status) u.set("status", status);
    if (payer) u.set("payer", payer);
    u.set("page", String(p));
    return `${adminRoutes.users}?${u}`;
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE + 1;
  const to = Math.min(total, page * PAGE);

  return (
    <AppMain className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 font-display text-[28px] font-bold">
          Users <span className="font-mono text-lg text-text-2">{total.toLocaleString("en-IN")}</span>
        </h1>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <SearchField name="q" label="Search users" placeholder="Email or user ID" defaultValue={sp.q} className="flex-[1_1_260px]" />
        <label className="flex items-center gap-2 text-sm text-text-2">
          Status
          <Select name="status" fieldSize="sm" defaultValue={status ?? ""} className="w-auto bg-surface">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-2">
          Payer
          <Select name="payer" fieldSize="sm" defaultValue={payer ?? ""} className="w-auto bg-surface">
            <option value="">Any</option>
            <option value="yes">Has topped up</option>
            <option value="no">Never topped up</option>
          </Select>
        </label>
        <button type="submit" className="h-10 cursor-pointer rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-2">
          Apply
        </button>
      </form>

      <AdminCard className="overflow-hidden">
        <AdminTable head={["User", "Joined", "Code", "Balance", "Top-ups", "AI actions", "Status", ""]} minWidth={900}>
          {rows.length === 0 ? (
            <EmptyRow cols={8}>No users match these filters.</EmptyRow>
          ) : (
            rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 flex-none items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{initialsOf(u.email)}</span>
                    <div className="flex min-w-0 flex-col">
                      <strong className="truncate">{maskEmail(u.email)}</strong>
                      <span className="font-mono text-xs text-text-2">
                        {u.id.slice(0, 8)}
                        {u.role === "admin" ? " · admin" : ""}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap text-text-2">{fmtDate(u.createdAt)}</td>
                <td className="font-mono text-[13px]">{u.code ?? "—"}</td>
                <td className="font-mono">{fmtCredits(u.balance)}</td>
                <td className="font-mono">{u.topups}</td>
                <td className="font-mono">{u.aiActions}</td>
                <td>
                  <StatusPill status={u.status} />
                </td>
                <td>
                  <Link href={adminRoutes.user(u.id)} className="font-semibold text-link">
                    View
                  </Link>
                </td>
              </tr>
            ))
          )}
        </AdminTable>
      </AdminCard>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-2">
        <span>
          Showing {from}–{to} of {total.toLocaleString("en-IN")}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <ButtonLink href={qs(page - 1)} variant="outline" className="h-9 border-border-strong px-3.5 text-sm">
              Previous
            </ButtonLink>
          ) : null}
          {to < total ? (
            <ButtonLink href={qs(page + 1)} variant="outline" className="h-9 border-border-strong px-3.5 text-sm">
              Next
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </AppMain>
  );
}
