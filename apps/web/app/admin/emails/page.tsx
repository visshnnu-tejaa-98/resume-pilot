import { adminEmailStats } from "@resume-pilot/services";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailTemplateToggle } from "@/components/admin/EmailTemplateToggle";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, AdminTable, Kpi, KpiGrid } from "@/components/admin/ui";
import { AppMain } from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { pct } from "@/lib/admin-format";
import { SUPPORT_EMAIL } from "@/lib/routes";
import { EMAIL_TEMPLATES } from "@/content/email-templates";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Email templates" };

/** design/screens/AdminEmails.dc.html */
export default async function AdminEmailsPage() {
  await requireAdmin();
  const s = await adminEmailStats(getDb());
  const sent = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
  const st = (k: string) => s.byStatus[k] ?? 0;
  const from = process.env.EMAIL_FROM_ADDRESS ?? "[SENDER EMAIL]";
  const smtpHost = process.env.SMTP_HOST;

  return (
    <AppMain className="gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-display text-[28px] font-bold">Email templates</h1>
          <span className="text-sm text-text-2">Transactional emails always send. Marketing emails respect each user&apos;s opt-out.</span>
        </div>
        <ButtonLink href={adminRoutes.campaign} className="h-10 px-4 text-sm">
          New campaign
        </ButtonLink>
      </div>

      <KpiGrid>
        <Kpi label="Sent (30 days)" value={sent.toLocaleString("en-IN")} sub="All templates" />
        <Kpi label="Sent OK" value={pct(st("sent"), sent)} sub={`${st("failed")} failed`} />
        <Kpi label="Queued" value={st("queued")} sub="Waiting for the worker" />
        <Kpi label="Skipped" value={st("skipped")} sub="Opted out or suppressed" />
      </KpiGrid>

      <div className="flex flex-wrap items-start gap-5">
        <AdminCard className="min-w-0 flex-[999_1_620px] overflow-hidden">
          <AdminTable head={["Template", "Trigger", "Sent 30d", "Sending", "On", ""]} minWidth={720}>
            {EMAIL_TEMPLATES.map((t) => {
              const marketing = t.kind === "marketing";
              const enabled = s.enabled[t.key] ?? true;
              return (
                <tr key={t.key}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong>{t.name}</strong>
                      <Chip tone={marketing ? "warn" : "info"} className="self-start px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.06em]">
                        {marketing ? "MARKETING" : "TRANSACTIONAL"}
                      </Chip>
                    </div>
                  </td>
                  <td className="font-mono text-[13px] text-text-2">{t.trigger}</td>
                  <td className="font-mono">{(s.sentByTemplate[t.key] ?? 0).toLocaleString("en-IN")}</td>
                  <td className="text-[13px]">{t.live ? <span className="text-good">Live</span> : <span className="text-text-2">Template ready</span>}</td>
                  <td>
                    {marketing ? (
                      <EmailTemplateToggle templateKey={t.key} name={t.name} enabled={enabled} />
                    ) : (
                      <span className="text-[13px] font-semibold text-text-2">Always</span>
                    )}
                  </td>
                  <td>
                    <Link href={`${adminRoutes.emails}/preview/${t.key}`} className="text-[13px] font-semibold text-link">
                      Preview
                    </Link>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
        </AdminCard>

        <aside className="flex flex-[1_1_280px] flex-col gap-4">
          <AdminCard className="flex flex-col gap-2.5 p-5">
            <strong className="font-display text-base">Sender</strong>
            {[
              ["From", from],
              ["Reply-to", SUPPORT_EMAIL],
              ["SMTP host", smtpHost || "not configured"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-sm">
                <span className="text-text-2">{k}</span>
                <span className={smtpHost || k !== "SMTP host" ? "text-right font-mono text-[13px] break-all" : "text-right text-[13px] text-crit"}>{v}</span>
              </div>
            ))}
          </AdminCard>
          <AdminCard className="flex flex-col gap-2 p-5">
            <strong className="font-display text-base">Domain checks</strong>
            <span className="text-[13px] leading-normal text-text-2">
              SPF, DKIM and DMARC are verified at the SMTP provider; check them there before sending campaigns.
            </span>
          </AdminCard>
        </aside>
      </div>
    </AppMain>
  );
}
