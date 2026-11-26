import { ButtonLink, TextLink } from "@/components/ui/Button";
import type { GenerationView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { fmtCredits } from "@/lib/format";
import { AdminHint } from "@/components/app/AdminHint";
import { describeAiFailure } from "@/lib/ai-errors";
import { appRoutes, routes } from "@/lib/routes";

const STEPS = [
  { label: "Analysing the job description", sub: "Reading requirements and preferred skills" },
  { label: "Matching your experience", sub: "Finding the bullets and projects that fit best" },
  { label: "Tailoring your resume", sub: "Summary, bullets, skills order and projects" },
  { label: "Checking every fact", sub: "Companies, titles, dates, skills and numbers vs your original" },
  { label: "Saving a new version", sub: "Your original stays unchanged" },
];

const ICON = { done: "M5 12l5 5 9-10", fail: "M7 7l10 10M17 7 7 17", now: "M12 7v5l3 2", todo: "M12 12h.01" };

/** design/screens/GenProgress.dc.html — running / done / failed. */
export function GenerationProgress({ g, isAdmin = false }: { g: GenerationView; isAdmin?: boolean }) {
  const { status } = g;
  const failure = status === "failed" ? describeAiFailure(g.error, "generation") : null;
  const eyebrow =
    status === "done" ? `COMPLETE · ${g.elapsed}` : status === "failed" ? "STOPPED · NO CHARGE" : "IN PROGRESS · USUALLY UNDER A MINUTE";
  const title = status === "done" ? "Your tailored resume is ready" : status === "failed" ? "Something went wrong" : "Tailoring your resume";
  const used = g.usedCredits ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className={cn("font-mono text-[13px] font-semibold", status === "failed" ? "text-crit" : status === "done" ? "text-good" : "text-accent-text")}>
          {eyebrow}
        </span>
        <h1 className="m-0 font-display text-[32px] font-bold tracking-[-0.01em]">{title}</h1>
        <span className="text-[15px] text-text-2">{g.label}</span>
      </div>

      <ol aria-label="Progress" className="m-0 list-none rounded-[14px] border border-border bg-surface px-6 py-2 shadow-card-sm">
        {STEPS.map((s, i) => {
          const done = i < g.currentStep;
          const cur = i === g.currentStep && status === "running";
          const fail = i === g.currentStep && status === "failed";
          const kind = done ? "done" : fail ? "fail" : cur ? "now" : "todo";
          return (
            <li key={s.label} aria-current={cur ? "step" : undefined} className="flex gap-4">
              <div className="flex flex-col items-center pt-4">
                <span
                  className={cn(
                    "box-border flex size-[26px] flex-none items-center justify-center rounded-full border-2",
                    done && "border-link bg-link text-white",
                    cur && "border-accent bg-surface text-accent-text",
                    fail && "border-crit bg-crit-bg text-crit",
                    kind === "todo" && "border-border-strong bg-surface text-border-strong",
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d={ICON[kind]} />
                  </svg>
                </span>
                <span
                  className={cn(
                    "mt-1 min-h-3 flex-1 border-l-2 border-dashed",
                    i === STEPS.length - 1 ? "border-transparent" : done ? "border-link" : "border-border-strong",
                  )}
                />
              </div>
              <div className="flex flex-1 justify-between gap-3 pt-[18px] pb-3.5">
                <div className="flex flex-col gap-[3px]">
                  <strong className={cn("text-[15px]", done || cur || fail ? "text-text" : "text-text-2")}>{s.label}</strong>
                  <span className="text-[13px] text-text-2">{s.sub}</span>
                </div>
                <span className="font-mono text-xs font-medium whitespace-nowrap text-text-2">{done ? g.stepTimes[i] : cur ? "now" : ""}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {status === "running" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-bg px-5 py-4">
          <span className="text-sm">
            <strong className="font-mono">{fmtCredits(g.heldCredits)}</strong> credits on hold. You&apos;ll only be charged what&apos;s used.
          </span>
          <TextLink href={routes.dashboard} className="text-sm">
            Leave and notify me
          </TextLink>
        </div>
      ) : null}

      {status === "done" ? (
        <div className="flex flex-col gap-4">
          <div role="status" className="flex gap-3 rounded-xl border border-good-line bg-good-bg px-[18px] py-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="flex-none text-good">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <span className="text-sm leading-normal">
              <strong>{fmtCredits(used)} credits used</strong> of {fmtCredits(g.heldCredits)} estimated. {fmtCredits(g.heldCredits - used)} returned to your wallet. Every fact
              matched your original.
            </span>
          </div>
          {g.versionId ? (
            <div className="flex flex-wrap justify-center gap-2.5">
              <ButtonLink href={appRoutes.version(g.versionId)} className="h-[46px]">
                Open in editor
              </ButtonLink>
              <ButtonLink href={appRoutes.versionReport(g.versionId)} variant="outline" className="h-[46px]">
                Get ATS score
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="flex flex-col gap-4">
          <div role="alert" className="flex gap-3 rounded-xl border border-crit-line bg-crit-bg px-[18px] py-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="flex-none text-crit">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
            <span className="text-sm leading-normal">
              <strong>{failure?.kind === "token_limit" ? "Generation hit the AI output limit." : "Generation didn't finish."}</strong> {failure?.message} All {fmtCredits(g.heldCredits)} held credits were released, so you weren&apos;t charged.
              {isAdmin && failure?.adminHint ? <AdminHint hint={failure.adminHint} /> : null}
            </span>
          </div>
          <div className="flex justify-center gap-2.5">
            <ButtonLink href={routes.generate} className="h-[46px]">
              Try again
            </ButtonLink>
            <ButtonLink href={routes.contact} variant="outline" className="h-[46px]">
              Contact support
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
