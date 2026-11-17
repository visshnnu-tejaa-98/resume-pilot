"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";

type Estimate = Awaited<ReturnType<typeof trpc.compare.estimate.query>>;

/**
 * Compare needs scores that aren't saved yet (prd.md §9.4): show only what
 * has to run, confirm (hold), poll both sides, then reload.
 */
export function CompareRunner(p: { versionId: string; aVersionId: string; jdId: string; aLabel: string; bLabel: string; jobLabel: string }) {
  const router = useRouter();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<string[] | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());

  const load = () =>
    trpc.compare.estimate
      .query({ aVersionId: p.aVersionId, bVersionId: p.versionId, jdId: p.jdId })
      .then(setEstimate)
      .catch((e: unknown) => setError(trpcErrorMessage(e)));

  useEffect(() => {
    void load();
  }, []); // once on mount

  useEffect(() => {
    if (!jobs) return;
    let stop = false;
    const tick = async () => {
      try {
        const all = await Promise.all(jobs.map((aiJobId) => trpc.scoring.status.query({ aiJobId })));
        if (stop) return;
        const failed = all.find((s) => s.status === "failed");
        if (failed) return setError(failed.error ?? "Scoring failed. Your credits were released.");
        if (all.every((s) => s.status === "succeeded")) return router.refresh();
      } catch (e) {
        if (!stop) setError(trpcErrorMessage(e));
        return;
      }
      setTimeout(() => !stop && void tick(), 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobs, router]);

  async function start() {
    if (!estimate) return;
    setError(null);
    try {
      const r = await trpc.compare.start.mutate({ aVersionId: p.aVersionId, bVersionId: p.versionId, jdId: p.jdId, confirmedCredits: estimate.total, requestId });
      const running = [r.a, r.b].flatMap((x) => (x.status === "running" ? [x.aiJobId] : []));
      if (running.length) setJobs(running);
      else router.refresh();
    } catch (e) {
      const msg = trpcErrorMessage(e);
      setError(msg);
      if (/estimate changed/i.test(msg)) void load();
    }
  }

  const need = estimate ? (["a", "b"] as const).filter((s) => !estimate.sides[s].cached) : [];
  return (
    <>
      <PageHeader title="Compare scores" subtitle="See what tailoring changed for one job." />
      <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-7">
        <p className="m-0 text-sm leading-[1.6]">
          <strong>A</strong> · {p.aLabel} vs <strong>B</strong> · {p.bLabel}, against {p.jobLabel}.
        </p>
        {error ? <Callout tone="warn">{error}</Callout> : null}
        {jobs ? (
          <Callout tone="info" role="status">
            <strong>Scoring…</strong> This usually takes under a minute.
          </Callout>
        ) : estimate ? (
          <>
            <div className="flex flex-col gap-2 text-sm">
              {need.map((s) => {
                const side = estimate.sides[s];
                return (
                  <div key={s} className="flex justify-between">
                    <span>Score version {s.toUpperCase()}</span>
                    <span className="font-mono">up to {side.cached ? 0 : side.credits}</span>
                  </div>
                );
              })}
              {estimate.analysisCredits ? (
                <div className="flex justify-between">
                  <span>Job description analysis (once)</span>
                  <span className="font-mono">up to {estimate.analysisCredits}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span className="font-mono">up to {estimate.total} credits</span>
              </div>
              <span className="text-xs text-text-2">Saved scores are reused for free. We hold the estimate and charge only what’s used.</span>
            </div>
            <Button className="h-11 self-start px-5" onClick={() => void start()}>
              {estimate.total ? "Confirm and compare" : "Compare · free"}
            </Button>
          </>
        ) : (
          <p className="m-0 text-sm text-text-2">Working out the estimate…</p>
        )}
      </section>
    </>
  );
}
