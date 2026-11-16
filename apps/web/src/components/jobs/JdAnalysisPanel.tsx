"use client";

import type { JdAnalysis, JdRequirement } from "@resume-pilot/validators";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { fmtCredits } from "@/lib/format";
import { routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { useWalletStore } from "@/stores/wallet-store";

export type AnalysisState =
  | { state: "ready"; analysis: JdAnalysis }
  | { state: "running"; aiJobId: string; credits: number }
  | { state: "failed"; error: string | null }
  | { state: "none" };

const POLL_MS = 3000;
const TYPE_LABEL: Record<JdRequirement["type"], string> = {
  skill: "Skill",
  tool: "Tool",
  qualification: "Qualification",
  experience: "Experience",
  education: "Education",
  responsibility: "Responsibility",
};

function RequirementList({ title, items }: { title: string; items: JdRequirement[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.06em] text-text-2">
        {title} · {items.length}
      </span>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm leading-normal">{r.text}</span>
              <span className="flex-none text-xs text-text-2">{TYPE_LABEL[r.type]}</span>
            </div>
            {r.keywords.length ? (
              <div className="flex flex-wrap gap-1.5">
                {r.keywords.map((k) => (
                  <Chip key={k} tone={r.priority === "required" ? "info" : "neutral"} size="xs">
                    {k}
                  </Chip>
                ))}
                {r.synonyms.map((s) => (
                  <Chip key={s} tone="gap" size="xs" title="Also matches">
                    {s}
                  </Chip>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * JD analysis (prd.md §7.2) on the job page. Paid once per JD: shows the
 * estimate, holds on confirm, then polls until the worker captures or
 * releases. An analysed JD is free to reuse forever.
 */
export function JdAnalysisPanel({ jdId, initial }: { jdId: string; initial: AnalysisState }) {
  const router = useRouter();
  const balance = useWalletStore((s) => s.balance);
  const [status, setStatus] = useState<AnalysisState>(initial);
  const [dialog, setDialog] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = (await trpc.jds.analysis.query({ jdId })) as AnalysisState;
    setStatus(next);
    // Capture/release changed the wallet: re-render server data (balance pill).
    if (next.state !== "running") router.refresh();
    return next;
  }, [jdId, router]);

  useEffect(() => {
    if (status.state !== "running") return;
    const id = window.setInterval(() => void refresh().catch(() => undefined), POLL_MS);
    return () => window.clearInterval(id);
  }, [status.state, refresh]);

  async function openConfirm() {
    setError(null);
    setEstimate(null);
    setDialog(true);
    try {
      const est = await trpc.jds.estimateAnalysis.query({ jdId });
      if (est.cached) {
        setDialog(false);
        await refresh();
      } else setEstimate(est.credits);
    } catch (err) {
      setError(trpcErrorMessage(err));
    }
  }

  async function confirm() {
    if (estimate === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await trpc.jds.analyze.mutate({ jdId, confirmedCredits: estimate });
      setDialog(false);
      if (r.status === "cached") await refresh();
      else setStatus({ state: "running", aiJobId: r.aiJobId, credits: r.credits });
    } catch (err) {
      const msg = trpcErrorMessage(err);
      setError(msg);
      // The estimate moved: show the new number for a fresh confirmation.
      if (/estimate changed/i.test(msg)) {
        const est = await trpc.jds.estimateAnalysis.query({ jdId }).catch(() => null);
        if (est && !est.cached) setEstimate(est.credits);
      }
    } finally {
      setBusy(false);
    }
  }

  const a = status.state === "ready" ? status.analysis : null;

  return (
    <section aria-labelledby="jd-analysis-title" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="jd-analysis-title" className="m-0 font-display text-lg font-bold">
          Job analysis
        </h2>
        {status.state === "ready" ? (
          <Chip tone="good" pill className="px-[9px] py-[3px] text-xs font-semibold">
            Analysed · reused for free
          </Chip>
        ) : null}
      </div>

      {status.state === "none" || status.state === "failed" ? (
        <>
          {status.state === "failed" ? (
            <Callout tone="warn" role="status">
              The last analysis didn&apos;t finish{status.error ? ` (${status.error})` : ""}. Its credits were released, so you weren&apos;t charged.
            </Callout>
          ) : null}
          <p className="m-0 text-sm leading-[1.6] text-text-2">
            We read the posting once and list what the employer is asking for: required and preferred skills, tools, experience and keywords. Every tailored
            resume and ATS score for this job reuses it at no extra cost.
          </p>
          <Button className="h-10 self-start px-4 text-sm" onClick={() => void openConfirm()}>
            {status.state === "failed" ? "Try again" : "Analyse this job"}
          </Button>
        </>
      ) : null}

      {status.state === "running" ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="text-sm">Reading the job description… this usually takes under a minute.</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-1.5 w-1/3 animate-[rp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-link" />
          </div>
          <span className="text-[13px] text-text-2">
            Up to <strong className="font-mono">{fmtCredits(status.credits)}</strong> credits on hold. You&apos;ll only be charged what&apos;s used; if it fails, nothing.
          </span>
        </div>
      ) : null}

      {a ? (
        <div className="flex flex-col gap-5">
          <dl className="m-0 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
            {[
              ["Role", a.jobTitle ?? "—"],
              ["Seniority", a.seniority ?? "—"],
              ["Experience", a.minYearsExperience != null ? `${a.minYearsExperience}+ years` : "Not stated"],
              ["Requirements", `${a.requirements.filter((r) => r.priority === "required").length} required · ${a.requirements.filter((r) => r.priority === "preferred").length} preferred`],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
                <dt className="text-xs text-text-2">{k}</dt>
                <dd className="m-0 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <RequirementList title="Required" items={a.requirements.filter((r) => r.priority === "required")} />
          <RequirementList title="Preferred" items={a.requirements.filter((r) => r.priority === "preferred")} />
          {a.educationRequirements.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-text-2">Education</span>
              {a.educationRequirements.map((e) => (
                <span key={e} className="text-sm">
                  {e}
                </span>
              ))}
            </div>
          ) : null}
          {a.domainTerms.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-text-2">Domain terms</span>
              <div className="flex flex-wrap gap-1.5">
                {a.domainTerms.map((t) => (
                  <Chip key={t} size="xs">
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Analyse this job?"
        subtitle="Runs once. Tailoring and scoring for this job reuse it for free."
        footer={
          <>
            <Button variant="ghost" className="h-11 px-4" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button className="h-11 px-5" disabled={estimate === null || busy || (balance !== null && estimate !== null && balance < estimate)} onClick={() => void confirm()}>
              {busy ? "Starting…" : "Confirm and analyse"}
            </Button>
          </>
        }
      >
        {estimate === null && !error ? <p className="m-0 text-sm text-text-2">Working out the estimate…</p> : null}
        {estimate !== null ? (
          <div className="flex flex-col gap-2.5 text-[15px]">
            <div className="flex justify-between font-bold">
              <span>Estimate</span>
              <span className="font-mono">up to {fmtCredits(estimate)} credits</span>
            </div>
            {balance !== null ? (
              <div className="flex justify-between text-text-2">
                <span>Balance after</span>
                <span className={cn("font-mono", balance < estimate && "text-crit")}>
                  {fmtCredits(balance)} → {fmtCredits(Math.max(0, balance - estimate))} or more
                </span>
              </div>
            ) : null}
            {balance !== null && balance < estimate ? (
              <Callout tone="warn">
                You need {fmtCredits(estimate - balance)} more credits.{" "}
                <a href={routes.wallet} className="font-semibold text-link">
                  Add money
                </a>
              </Callout>
            ) : (
              <span className="text-[13px] text-text-2">We hold the estimate and charge only what&apos;s used. If anything fails, you pay nothing.</span>
            )}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm text-crit">
            {error}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
