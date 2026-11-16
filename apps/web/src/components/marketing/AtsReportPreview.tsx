import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Meter } from "@/components/ui/Meter";
import { sampleDimensions } from "@/content/marketing";

function ScoreFigure({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[13px] font-semibold text-text-2">{label}</span>
      <span className={muted ? "font-mono text-4xl font-semibold text-text-2" : "font-mono text-4xl font-semibold text-text"}>
        {value}
      </span>
    </div>
  );
}

/** Original → tailored score card with dimension bars and gaps. */
export function AtsReportPreview() {
  return (
    <Card radius="lg" shadow className="flex flex-col gap-6 p-7">
      <div className="flex flex-wrap items-center gap-6">
        <ScoreFigure label="Original" value={61} muted />
        <svg width="40" height="24" viewBox="0 0 40 24" aria-hidden="true">
          <path d="M2 12h32M28 5l7 7-7 7" fill="none" className="stroke-border-strong" strokeWidth="2" />
        </svg>
        <ScoreFigure label="Tailored" value={82} />
        <Chip tone="good" mono className="ml-auto px-2.5 py-1.5">
          +21 points
        </Chip>
      </div>
      <div className="flex flex-col gap-3">
        {sampleDimensions.map((d) => (
          <Meter key={d.label} {...d} />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-text-2">Missing from your resume</span>
        <div className="flex flex-wrap gap-2">
          <Chip tone="gap">Kubernetes</Chip>
          <Chip tone="gap">GraphQL</Chip>
          <Chip tone="warn">CI/CD · partial</Chip>
        </div>
      </div>
    </Card>
  );
}
