"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { appRoutes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";

type Estimate = Awaited<ReturnType<typeof trpc.scoring.estimate.query>>;
const LABELS = { jd_analysis: "Job description analysis", ats_scoring: "ATS score and report" } as const;

/**
 * Score / re-score (prd.md §9, §3.4): estimate → confirm (hold) → poll.
 * Content + JD already scored is free and just opens that report.
 */
export function ScoreButton({ versionId, jdId, label, className, variant }: { versionId: string; jdId: string | null; label: string; className?: string; variant?: "primary" | "outline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState("");

  async function load() {
    if (!jdId) return;
    setEstimate(null);
    setError(null);
    try {
      setEstimate(await trpc.scoring.estimate.query({ versionId, jdId }));
    } catch (err) {
      setError(trpcErrorMessage(err, "We couldn’t work out the cost right now."));
    }
  }

  function openDialog() {
    setRequestId(crypto.randomUUID());
    setOpen(true);
    void load();
  }

  async function confirm() {
    if (!jdId || !estimate) return;
    setBusy(true);
    setError(null);
    try {
      const r = await trpc.scoring.start.mutate({ versionId, jdId, confirmedCredits: estimate.cached ? 0 : estimate.total, requestId });
      setOpen(false);
      router.push(appRoutes.versionReport(versionId, { jd: jdId, job: r.status === "running" ? r.aiJobId : undefined }));
      router.refresh();
    } catch (err) {
      const msg = trpcErrorMessage(err);
      setError(msg);
      if (/estimate changed/i.test(msg)) void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button className={className} variant={variant} disabled={!jdId} onClick={openDialog}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Score this resume"
        subtitle="You’ll see the most it can cost before anything runs."
        footer={
          <>
            <Button variant="ghost" className="h-11 px-[18px]" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="h-11 px-5" disabled={!estimate || busy} onClick={() => void confirm()}>
              {busy ? "Starting…" : estimate?.cached ? "Open report · free" : "Confirm and score"}
            </Button>
          </>
        }
      >
        {error ? <Callout tone="warn">{error}</Callout> : null}
        {!estimate && !error ? <p className="m-0 text-sm text-text-2">Working out the estimate…</p> : null}
        {estimate?.cached ? <p className="m-0 text-sm text-text-2">This exact content was already scored against this job. Opening it is free.</p> : null}
        {estimate && !estimate.cached ? (
          <div className="flex flex-col gap-2 text-sm">
            {estimate.lines.map((l) => (
              <div key={l.action} className="flex justify-between">
                <span>{LABELS[l.action]}</span>
                <span className="font-mono">up to {l.credits}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono">up to {estimate.total} credits</span>
            </div>
            <span className="text-xs text-text-2">We hold the estimate and charge only what’s used. If anything fails, you pay nothing.</span>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

/** Polls a running scoring job, then reloads the page onto its report. */
export function ScoringPending({ versionId, jdId, aiJobId }: { versionId: string; jdId: string; aiJobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await trpc.scoring.status.query({ aiJobId });
        if (stop) return;
        if (s.status === "succeeded") {
          router.replace(appRoutes.versionReport(versionId, { jd: jdId }));
          router.refresh();
          return;
        }
        if (s.status === "failed") {
          setError(s.error ?? "Scoring failed. Your credits were released.");
          return;
        }
      } catch (err) {
        if (!stop) setError(trpcErrorMessage(err));
        return;
      }
      timer = setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [aiJobId, jdId, router, versionId]);

  return error ? (
    <Callout tone="warn" role="alert">
      <strong>Scoring didn’t finish.</strong> {error} You weren’t charged.
    </Callout>
  ) : (
    <Callout tone="info" role="status">
      <strong>Scoring…</strong> Checking your resume against the job. This usually takes under a minute.
    </Callout>
  );
}
