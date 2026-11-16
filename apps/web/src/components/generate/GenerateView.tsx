"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { estimateRun, type EstimateResult } from "@/server/actions/estimate";
import { FlowSteps } from "@/components/app/FlowSteps";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { fmtCredits } from "@/lib/format";
import { appRoutes, routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { useWalletStore } from "@/stores/wallet-store";

export interface GenerateSource {
  /** resume_versions.id */
  id: string;
  name: string;
  /** "Original · uploaded 3 days ago" / "Tailored version · edited today". */
  sub: string;
}

export interface GenerateJob {
  id: string;
  name: string;
  chars: number;
  analysed: boolean;
}

interface GenerateViewProps {
  mode: "tailor" | "score";
  sources: GenerateSource[];
  jobs: GenerateJob[];
  initialSource: string | null;
  initialJob: string | null;
  balance: number;
}

function Option({ on, children, onSelect, name }: { on: boolean; children: React.ReactNode; onSelect: () => void; name: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg p-3.5",
        on ? "border-2 border-link bg-sel-bg" : "border border-border hover:border-border-strong",
      )}
    >
      <input type="radio" name={name} checked={on} onChange={onSelect} className="size-[18px] flex-none accent-link" />
      {children}
    </label>
  );
}

/** design/screens/Generate.dc.html — pick source + job, see the estimate, confirm. */
export function GenerateView({ mode, sources, jobs, initialSource, initialJob, balance }: GenerateViewProps) {
  const live = useWalletStore((s) => s.balance) ?? balance;
  const [source, setSource] = useState(initialSource ?? sources[0]?.id ?? null);
  const [job, setJob] = useState(initialJob ?? jobs[0]?.id ?? null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  /** One per confirmation dialog: a double submit maps to the same hold (§3.4). */
  const [requestId, setRequestId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const router = useRouter();

  async function confirm() {
    if (!source || !job || !estimate?.ok) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const r = await trpc.generation.start.mutate({ sourceVersionId: source, jdId: job, confirmedCredits: estimate.total, requestId });
      router.push(appRoutes.generation(r.aiJobId));
    } catch (err) {
      const msg = trpcErrorMessage(err);
      setConfirmError(msg);
      // The price moved: re-estimate so the user confirms the new number.
      if (/estimate changed/i.test(msg)) setEstimate(await estimateRun({ versionId: source, jdId: job, mode }));
      setConfirming(false);
    }
  }

  const src = sources.find((s) => s.id === source);
  const jd = jobs.find((j) => j.id === job);
  const tailor = mode === "tailor";

  function proceed() {
    if (!source || !job) return;
    setEstimate(null);
    setOpen(true);
    setRequestId(crypto.randomUUID());
    setConfirmError(null);
    start(async () => setEstimate(await estimateRun({ versionId: source, jdId: job, mode })));
  }

  const legend = "font-display text-lg font-semibold px-1.5";

  return (
    <>
      <FlowSteps current={tailor ? 3 : 4} />
      <PageHeader
        title={tailor ? "Tailor a resume" : "Score a resume"}
        subtitle={
          tailor
            ? "Pick the resume to start from and the job to tailor it for. Your source stays unchanged."
            : "Pick the resume to score and the job to score it against."
        }
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <fieldset className="m-0 flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-5">
            <legend className={legend}>1. {tailor ? "Start from" : "Resume"}</legend>
            {sources.length === 0 ? (
              <p className="m-0 text-sm text-text-2">
                No reviewed resumes yet. <Link href={routes.upload} className="font-semibold text-link">Upload one</Link> and finish the review first.
              </p>
            ) : (
              sources.map((s) => (
                <Option key={s.id} name="src" on={s.id === source} onSelect={() => setSource(s.id)}>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <strong className="text-[15px]">{s.name}</strong>
                    <span className="text-[13px] text-text-2">{s.sub}</span>
                  </span>
                </Option>
              ))
            )}
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-5">
            <legend className={legend}>2. {tailor ? "Tailor for" : "Score against"}</legend>
            {jobs.map((j) => (
              <Option key={j.id} name="job" on={j.id === job} onSelect={() => setJob(j.id)}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="truncate text-[15px]">{j.name}</strong>
                  <span className="text-[13px] text-text-2">{fmtCredits(j.chars)} characters</span>
                </span>
                <span className={cn("text-xs font-semibold whitespace-nowrap", j.analysed ? "text-good" : "text-text-2")}>
                  {j.analysed ? "Analysed" : "Needs analysis"}
                </span>
              </Option>
            ))}
            <Link href={routes.jobNew} className="px-0.5 py-1.5 text-sm font-semibold text-link">
              + Paste a new job description
            </Link>
          </fieldset>
        </div>

        <aside className="flex flex-[1_1_300px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-[22px] shadow-card-sm md:sticky md:top-24">
          <strong className="font-display text-lg">Summary</strong>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-text-2">{tailor ? "From" : "Resume"}</span>
            <strong>{src?.name ?? "—"}</strong>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-text-2">{tailor ? "For" : "Against"}</span>
            <strong>{jd?.name ?? "—"}</strong>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3.5 text-sm">
            <span className="text-text-2">Will run</span>
            {jd && !jd.analysed ? (
              <span>
                Job description analysis <span className="text-text-2">(first time for this job)</span>
              </span>
            ) : null}
            <span>{tailor ? "Resume generation" : "ATS score and report"}</span>
          </div>
          <span className="text-[13px] leading-normal text-text-2">You&apos;ll see the exact credit estimate before anything runs.</span>
          <Button size="lg" className="h-12" disabled={!src || !jd} onClick={proceed}>
            Proceed
          </Button>
        </aside>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        title={tailor ? "Generate tailored resume?" : "Score this resume?"}
        subtitle={`${jd?.name ?? ""} · from ${src?.name ?? "your original"}`}
        footer={
          <>
            <Button variant="ghost" className="h-11 px-[18px]" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {tailor ? (
              <Button className="h-11 px-5" disabled={!estimate?.ok || confirming || live < (estimate?.ok ? estimate.total : 0)} onClick={() => void confirm()}>
                {confirming ? "Starting…" : "Confirm and generate"}
              </Button>
            ) : (
              // Scoring jobs arrive with m7; nothing is held or charged until then.
              <Button className="h-11 px-5" disabled title="Opening soon">
                Confirm and score
              </Button>
            )}
          </>
        }
      >
        {pending || !estimate ? (
          <p className="m-0 text-sm text-text-2" aria-busy="true">
            Working out the estimate…
          </p>
        ) : estimate.ok ? (
          <div className="flex flex-col gap-2.5 text-[15px]">
            {estimate.lines.map((l) => (
              <div key={l.label} className="flex justify-between">
                <span>{l.label}</span>
                <span className="font-mono">up to {fmtCredits(l.credits)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2.5 font-bold">
              <span>Estimate</span>
              <span className="font-mono">up to {fmtCredits(estimate.total)} credits</span>
            </div>
            <div className="flex justify-between text-text-2">
              <span>Balance after</span>
              <span className="font-mono">
                {fmtCredits(live)} → {fmtCredits(Math.max(0, live - estimate.total))} or more
              </span>
            </div>
            {live < estimate.total ? (
              <Callout tone="warn">
                You need {fmtCredits(estimate.total - live)} more credits.{" "}
                <Link href={routes.wallet} className="font-semibold text-link">
                  Add money
                </Link>
              </Callout>
            ) : (
              <Callout tone="info" icon={<InfoIcon />} className="text-[13px]">
                We hold the estimate and charge only what&apos;s used. If anything fails, you pay nothing.
              </Callout>
            )}
            {!tailor ? <span className="text-[13px] text-text-2">Scoring opens soon. Nothing has been held or charged.</span> : null}
            {confirmError ? (
              <p role="alert" className="m-0 text-sm text-crit">
                {confirmError}
              </p>
            ) : null}
          </div>
        ) : (
          <Callout tone="crit" role="alert">
            {estimate.message}
          </Callout>
        )}
      </Dialog>
    </>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </svg>
  );
}

