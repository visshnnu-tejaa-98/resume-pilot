import { PageHeader } from "@/components/app/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { ScoreRing } from "@/components/ui/ScoreRing";
import type { CompareView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { appRoutes } from "@/lib/routes";

const card = "rounded-[14px] border border-border bg-surface";
const th = "px-3 py-3.5 text-xs uppercase tracking-[0.06em] text-text-2";

/** design/screens/Compare.dc.html */
export function CompareScores({ c }: { c: CompareView }) {
  const delta = c.b.score - c.a.score;
  return (
    <>
      <PageHeader title="Compare scores" subtitle="See what tailoring changed for one job." />

      <div className="flex flex-wrap items-end gap-3.5 rounded-xl border border-border bg-surface p-[18px]">
        {[
          ["Version A", c.a.label],
          ["Version B", c.b.label],
          ["Against job", c.jobLabel],
        ].map(([label, value]) => (
          <label key={label} className="flex flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-semibold">
            {label}
            <Select fieldSize="sm" defaultValue={value} className="font-medium">
              <option>{value}</option>
            </Select>
          </label>
        ))}
        <span className={cn("basis-full text-[13px] font-medium", c.free ? "text-good" : "text-text-2")}>
          {c.free ? "Both scores are saved, so this comparison is free." : "Scores that aren’t saved yet will need credits."}
        </span>
      </div>

      <div className="grid items-stretch gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
        <div className={cn(card, "flex flex-col items-center gap-2.5 p-6")}>
          <span className="text-[13px] font-semibold text-text-2">A · {c.a.label}</span>
          <ScoreRing score={c.a.score} size={140} strokeWidth={11} arcClassName="stroke-border-strong" />
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] bg-hero p-6 text-on-hero">
          <span className="text-[13px] text-on-hero-3">Change</span>
          <span className={cn("font-mono text-5xl font-semibold", delta > 0 ? "text-hero-good" : "text-on-hero")}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
          <span className="text-sm text-on-hero-2">points after tailoring</span>
        </div>
        <div className="flex flex-col items-center gap-2.5 rounded-[14px] border-2 border-accent bg-surface p-6">
          <span className="text-[13px] font-semibold text-text-2">B · {c.b.label}</span>
          <ScoreRing score={c.b.score} size={140} strokeWidth={11} />
        </div>
      </div>

      <section className={cn(card, "overflow-x-auto")}>
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th scope="col" className={`${th} pl-5`}>Category</th>
              <th scope="col" className={`${th} text-right`}>A</th>
              <th scope="col" className={`${th} text-right`}>B</th>
              <th scope="col" className={`${th} pr-5 text-right`}>Change</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row) => {
              const d = row.b - row.a;
              return (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-3.5 pr-3 pl-5">{row.label}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-text-2">
                    {row.a} / {row.max}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono font-semibold">
                    {row.b} / {row.max}
                  </td>
                  <td className={cn("py-3.5 pr-5 pl-3 text-right font-mono font-semibold", d > 0 ? "text-good" : "text-text-2")}>
                    {d > 0 ? `+${d}` : d}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        <section className={cn(card, "flex flex-col gap-3 p-5")}>
          <h2 className="m-0 font-display text-lg font-bold">Keywords gained</h2>
          <div className="flex flex-wrap gap-2">
            {c.gained.map((g) => (
              <Chip key={g} tone="good" className="px-2.5 py-[5px]">
                + {g}
              </Chip>
            ))}
          </div>
          <span className="text-[13px] text-text-2">All were already in your experience; tailoring used the job&apos;s wording.</span>
        </section>
        <section className={cn(card, "flex flex-col gap-3 p-5")}>
          <h2 className="m-0 font-display text-lg font-bold">Still missing</h2>
          <div className="flex flex-wrap gap-2">
            {c.stillMissing.map((m) => (
              <Chip key={m.keyword} tone={m.partial ? "warn" : "gap"}>
                {m.keyword}
                {m.partial ? " · partial" : ""}
              </Chip>
            ))}
          </div>
          <TextLink href={appRoutes.versionReport(c.versionId)} className="text-sm">
            See recommendations
          </TextLink>
        </section>
      </div>

      <section className={cn(card, "flex flex-col gap-3 p-5")}>
        <h2 className="m-0 font-display text-lg font-bold">What changed in one bullet</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
          <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3.5">
            <span className="text-xs font-bold tracking-[0.06em] text-text-2">ORIGINAL</span>
            <span className="text-sm leading-[1.55]">{c.bulletDiff.original}</span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-good-bg p-3.5">
            <span className="text-xs font-bold tracking-[0.06em] text-good">TAILORED</span>
            <span className="text-sm leading-[1.55]">{c.bulletDiff.tailored}</span>
          </div>
        </div>
        <span className="text-[13px] text-text-2">Same role, same facts. The fact check confirmed nothing was added.</span>
      </section>
    </>
  );
}
