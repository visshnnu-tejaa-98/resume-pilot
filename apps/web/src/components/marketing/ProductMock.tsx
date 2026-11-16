import { Chip } from "@/components/ui/Chip";
import { ScoreRing } from "@/components/ui/ScoreRing";

function Skeleton({ width }: { width: string }) {
  return <div className="h-1.5 rounded-[3px] bg-surface-2" style={{ width }} />;
}

function Hit({ children }: { children: string }) {
  return <span className="rounded-[3px] bg-good-bg px-[3px] text-good">{children}</span>;
}

/** Generated-resume + score card floating in the landing hero. */
export function ProductMock() {
  return (
    <div className="relative flex justify-center">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[14px] border border-border bg-surface text-text shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
          <span className="text-[13px] font-semibold">Acme Corp · Frontend Engineer</span>
          <Chip tone="good" mono className="px-2 py-[3px] text-xs">
            Generated
          </Chip>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-2 border-r border-border p-[18px]">
            <div className="font-display text-base font-bold">Asha Rao</div>
            <div className="text-[11px] text-text-2">Frontend Engineer · Bengaluru</div>
            <div className="my-1 h-px bg-border" />
            <div className="text-[10px] font-bold tracking-[0.08em] text-text-2">EXPERIENCE</div>
            <div className="text-[11px] leading-normal">
              Built a <Hit>React</Hit> + <Hit>TypeScript</Hit> design system used by 4 product teams.
            </div>
            <div className="text-[11px] leading-normal">Cut page load time by 38% by moving to server rendering.</div>
            <Skeleton width="80%" />
            <Skeleton width="65%" />
            <div className="mt-1 text-[10px] font-bold tracking-[0.08em] text-text-2">SKILLS</div>
            <Skeleton width="90%" />
          </div>
          <div className="flex flex-col items-center gap-3 p-[18px]">
            <ScoreRing score={82} caption="ATS score" />
            <span className="font-mono text-xs font-semibold text-good">+21 vs original</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Chip tone="good" size="xs">React</Chip>
              <Chip tone="good" size="xs">TypeScript</Chip>
              <Chip tone="warn" size="xs">CI/CD</Chip>
              <Chip tone="gap" size="xs" className="px-[7px] py-[3px]">Kubernetes</Chip>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-7 -left-2 flex items-center gap-2.5 rounded-[10px] border border-hero-line bg-brand-ink px-3.5 py-3 text-[13px] text-on-hero shadow-[0_12px_30px_rgba(0,0,0,0.4)]">
        <span className="size-2 rounded-full bg-brand" />
        <span>
          Charged <strong className="font-mono">582</strong> of 640 estimated credits
        </span>
      </div>
    </div>
  );
}
