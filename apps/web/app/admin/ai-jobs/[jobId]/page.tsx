import { adminGetAiJob } from "@resume-pilot/services";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/nav";
import { AdminCard, Kpi, KpiGrid, StatusPill } from "@/components/admin/ui";
import { AppMain, PageHeader } from "@/components/app/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { aiTypeLabel, fmtDateTime, fmtDuration, fmtPaise, maskEmail, shortId } from "@/lib/admin-format";
import { fmtCredits } from "@/lib/format";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "AI job" };

/**
 * design/screens/AdminAiJobDetail.dc.html. The timeline is reconstructed
 * from the job and its hold; per-attempt fact-check detail arrives with
 * generation (m6). Prompt and output content are never shown here.
 */
export default async function AdminAiJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  await requireAdmin();
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();
  const d = await adminGetAiJob(getDb(), jobId);
  if (!d) notFound();
  const { job, hold } = d;
  const tokens = (job.inputTokens ?? 0) + (job.outputTokens ?? 0);
  const durationMs = +new Date(job.updatedAt) - +new Date(job.createdAt);
  const done = job.status === "succeeded" || job.status === "failed";

  const events: { h: string; p: string; at: Date; dot: string }[] = [
    { h: "Queued", p: "Confirmed by user after the estimate dialog", at: job.createdAt, dot: "bg-info" },
    ...(hold ? [{ h: "Hold placed", p: `${fmtCredits(hold.amount)} credits held · key ${job.idempotencyKey}`, at: hold.createdAt, dot: "bg-accent" }] : []),
    ...(job.status === "succeeded"
      ? [{ h: "Hold captured", p: `${fmtCredits(job.creditsCharged ?? 0)} charged · ${fmtCredits(Math.max(0, (hold?.amount ?? job.creditsEstimated) - (job.creditsCharged ?? 0)))} released`, at: job.updatedAt, dot: "bg-good" }]
      : []),
    ...(job.status === "failed" ? [{ h: "Failed · hold released", p: job.error ?? "No error recorded", at: job.updatedAt, dot: "bg-crit" }] : []),
  ];

  return (
    <AppMain className="gap-6">
      <PageHeader
        crumbs={[{ href: adminRoutes.aiJobs, label: "AI jobs" }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {aiTypeLabel(job.type)} · <span className="font-mono">{shortId(job.id, "job_")}</span>
            <StatusPill status={job.status} />
          </span>
        }
        subtitle={`${maskEmail(job.userEmail)} · ${fmtDateTime(job.createdAt)}`}
        actions={
          <ButtonLink href={adminRoutes.user(job.userId)} variant="outline" className="h-10 px-4 text-sm">
            Open user
          </ButtonLink>
        }
      />

      <KpiGrid min={150}>
        <Kpi label="Duration" value={done ? fmtDuration(durationMs) : "—"} />
        <Kpi label="Tokens" value={tokens ? tokens.toLocaleString("en-IN") : "—"} />
        <Kpi label="AI cost" value={job.costPaise != null ? fmtPaise(job.costPaise, 2) : "—"} />
        <Kpi label="Estimate" value={fmtCredits(job.creditsEstimated)} />
        <Kpi label="Charged" value={job.status === "failed" ? "0" : job.creditsCharged != null ? fmtCredits(job.creditsCharged) : "—"} />
      </KpiGrid>

      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <AdminCard className="flex flex-col gap-1 p-5">
          <h2 className="m-0 mb-3 font-display text-lg font-bold">Timeline</h2>
          <ol className="m-0 flex list-none flex-col p-0">
            {events.map((e, i) => (
              <li key={e.h} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1.5 size-2.5 flex-none rounded-full", e.dot)} />
                  <span className={cn("w-px flex-1", i === events.length - 1 ? "bg-transparent" : "bg-border")} />
                </div>
                <div className="flex flex-1 justify-between gap-3 pb-4">
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-sm">{e.h}</strong>
                    <span className="text-[13px] break-all text-text-2">{e.p}</span>
                  </div>
                  <span className="font-mono text-xs whitespace-nowrap text-text-2">
                    {new Date(e.at).toLocaleTimeString("en-IN", { hour12: false })}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </AdminCard>

        <div className="flex flex-col gap-5">
          {job.error ? (
            <AdminCard className="flex flex-col gap-2 border-crit-line bg-crit-bg p-5">
              <strong className="text-sm text-crit">Error</strong>
              <code className="font-mono text-[13px] leading-normal break-words whitespace-pre-wrap">{job.error}</code>
            </AdminCard>
          ) : null}
          <AdminCard className="flex flex-col gap-2.5 p-5">
            <strong className="font-display text-lg">Configuration</strong>
            {[
              ["Model", job.model ?? "—"],
              ["Pricing config", `v${job.pricingConfigVersion}`],
              ["Idempotency key", job.idempotencyKey],
              ["Hold", hold ? `${fmtCredits(hold.amount)} · ${hold.status}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-t border-border pt-2.5 text-sm first-of-type:border-t-0">
                <span className="text-text-2">{k}</span>
                <span className="font-mono text-[13px] break-all">{v}</span>
              </div>
            ))}
            <span className="text-xs text-text-2">Prompt and output content are not shown here. Opening them needs a logged reason.</span>
          </AdminCard>
        </div>
      </div>
    </AppMain>
  );
}
