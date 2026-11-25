import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { ScoreButton } from "@/components/ats/ScoreRunner";
import { DownloadPdfButton } from "@/components/resume/DownloadPdfButton";
import { ButtonLink, TextLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { ScoreRing } from "@/components/ui/ScoreRing";
import type { AtsReportView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { appRoutes, routes } from "@/lib/routes";

const card = "rounded-[14px] border border-border bg-surface";

/** design/screens/AtsReport.dc.html */
export function AtsReport({ r }: { r: AtsReportView }) {
  const bandTone = r.band === "Strong match" ? "good" : r.band === "Good match" ? "info" : "warn";
  return (
    <>
      <Link
        href={r.editorHref}
        className="-mb-2 flex items-center gap-1.5 self-start text-sm font-semibold text-link no-underline hover:underline"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Back to editor
      </Link>
      <PageHeader
        crumbs={[
          { href: routes.resumes, label: "My resumes" },
          { href: appRoutes.version(r.versionId), label: r.title },
        ]}
        title="ATS report"
        subtitle={r.subtitle}
        actions={
          <>
            <DownloadPdfButton
              versionId={r.versionId}
              variant="outline"
              className="h-[42px] gap-2 px-4 text-sm"
            />
            <ButtonLink
              href={appRoutes.versionCompare(r.versionId, { jd: r.jdId })}
              variant="outline"
              className="h-[42px] px-4 text-sm"
            >
              Compare with original
            </ButtonLink>
            <ScoreButton
              versionId={r.versionId}
              jdId={r.jdId}
              label="Re-score"
              className="h-[42px] px-[18px] text-sm"
            />
          </>
        }
      />

      {r.outdated ? (
        <Callout tone="warn" role="status">
          <strong>Outdated.</strong> You edited this resume after it was scored. The numbers below
          are from the earlier version.
        </Callout>
      ) : null}

      <nav aria-label="Report sections" className="flex flex-wrap gap-1 border-b border-border">
        {[
          ["overview", "Overview"],
          ["keywords", "Keywords"],
          ["skills", "Skills match"],
          ["recs", "Recommendations"],
          ["history", "History"],
        ].map(([id, label], i) => (
          <a
            key={id}
            href={`#${id}`}
            className={cn(
              "-mb-px border-b-[3px] px-4 py-3 text-sm no-underline",
              i === 0
                ? "border-accent font-semibold text-text"
                : "border-transparent font-medium text-text-2 hover:text-text",
            )}
          >
            {label}
          </a>
        ))}
      </nav>

      <section
        id="overview"
        className={cn(card, "flex scroll-mt-24 flex-wrap items-center gap-8 p-7 max-sm:p-5")}
      >
        <div className="flex flex-col items-center gap-2.5">
          <ScoreRing score={r.score} size={176} caption="out of 100" strokeWidth={11} />
          <Chip tone={bandTone} pill className="px-2.5 py-1 font-semibold">
            {r.band}
          </Chip>
        </div>
        <div className="flex flex-[1_1_380px] flex-col gap-3.5">
          {r.dimensions.map((d) => {
            const ratio = d.value / d.max;
            return (
              <div key={d.label} className="flex flex-col gap-[5px]">
                <div className="flex justify-between text-sm">
                  <span>
                    {d.label} <span className="text-text-2">· {d.weightPct}%</span>
                  </span>
                  <span className="font-mono font-semibold">
                    {d.value} / {d.max}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-2">
                  <div
                    className={cn("h-2 rounded-full", ratio >= 0.75 ? "bg-good" : "bg-accent")}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="m-0 text-sm leading-[1.6] text-text-2">{r.summary}</p>
          <span className="text-xs text-text-2">
            Estimated compatibility score. Employers&apos; ATS systems differ; this is not a
            guarantee.{" "}
            <TextLink href={routes.faq} className="font-normal underline">
              How scoring works
            </TextLink>
          </span>
        </div>
      </section>

      <div
        id="keywords"
        className="grid scroll-mt-24 items-stretch gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))" }}
      >
        <section className={cn(card, "flex h-[480px] flex-col gap-3.5 p-[22px]")}>
          <h2 className="m-0 flex flex-none justify-between font-display text-[19px] font-bold">
            Matched keywords{" "}
            <span className="font-mono text-[15px] text-good">{r.matchedTotal}</span>
          </h2>
          <div
            tabIndex={0}
            aria-label="Matched keywords list"
            className="-mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
          >
            {r.matched.length === 0 ? (
              <p className="m-0 text-sm text-text-2">No matching keywords yet.</p>
            ) : null}
            {r.matched.map((m, i) => (
              <div
                key={m.keyword}
                className={cn(
                  "flex flex-col gap-1 py-3",
                  i > 0 && "border-t border-border",
                  i === 0 && "pt-0",
                )}
              >
                <Chip tone="good" className="self-start px-[9px] py-1 font-semibold">
                  {m.keyword}
                </Chip>
                <Link
                  href={m.href}
                  className="text-[13px] leading-normal text-text-2 underline-offset-2 hover:text-text hover:underline"
                >
                  “{m.evidence}”
                </Link>
              </div>
            ))}
          </div>
        </section>
        <section className={cn(card, "flex h-[480px] flex-col gap-3.5 p-[22px]")}>
          <h2 className="m-0 flex flex-none justify-between font-display text-[19px] font-bold">
            Missing or partial{" "}
            <span className="font-mono text-[15px] text-warn">{r.missing.length}</span>
          </h2>
          <div
            tabIndex={0}
            aria-label="Missing or partial keywords list"
            className="-mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
          >
            {r.missing.length === 0 ? (
              <p className="m-0 text-sm text-text-2">Nothing missing. Nice.</p>
            ) : null}
            {r.missing.map((m, i) => (
              <div
                key={m.keyword}
                className={cn(
                  "flex flex-col gap-1.5 py-3",
                  i > 0 && "border-t border-border",
                  i === 0 && "pt-0",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Chip tone={m.partial ? "warn" : "gap"} className="font-semibold">
                    {m.keyword}
                  </Chip>
                  <span className="text-xs text-text-2">{m.priority}</span>
                </div>
                <span className="text-[13px] leading-normal text-text-2">{m.why}</span>
              </div>
            ))}
          </div>
          <span className="flex-none border-t border-border pt-3 text-xs leading-normal text-text-2">
            We never add skills for you. If you have one of these, add it to your resume yourself
            and re-score.
          </span>
        </section>
      </div>

      <section
        id="skills"
        className={cn(card, "grid scroll-mt-24 gap-5 p-[22px]")}
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
        {r.skillStats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-2">{s.label}</span>
            <span className="font-mono text-[26px] font-semibold">{s.value}</span>
            <span className="text-[13px] text-text-2">{s.sub}</span>
          </div>
        ))}
      </section>

      <section id="recs" className={cn(card, "flex scroll-mt-24 flex-col gap-1 p-[22px]")}>
        <h2 className="m-0 mb-2.5 font-display text-[19px] font-bold">Recommendations</h2>
        {r.recommendations.map((rec, i) => (
          <div
            key={rec.title}
            className={cn("flex gap-3.5 py-3.5", i > 0 && "border-t border-border")}
          >
            <span className="flex size-7 flex-none items-center justify-center rounded-full bg-surface-2 font-mono text-xs font-semibold">
              {i + 1}
            </span>
            <div className="flex flex-1 flex-col gap-[3px]">
              <strong className="text-[15px]">{rec.title}</strong>
              <span className="text-sm leading-[1.55] text-text-2">{rec.body}</span>
            </div>
            <Link
              href={appRoutes.version(r.versionId)}
              className="text-[13px] font-semibold whitespace-nowrap text-link"
            >
              Edit
            </Link>
          </div>
        ))}
      </section>

      <section id="history" className={cn(card, "scroll-mt-24 overflow-hidden")}>
        <h2 className="m-0 px-[22px] py-[18px] font-display text-[19px] font-bold">
          Score history
        </h2>
        {r.history.map((h) => (
          <div
            key={h.when + h.note}
            className="flex justify-between gap-3 border-t border-border px-[22px] py-3.5 text-sm"
          >
            <span>{h.when}</span>
            <span className="text-text-2">{h.note}</span>
            <span className="font-mono font-semibold">{h.score}</span>
          </div>
        ))}
      </section>
    </>
  );
}
