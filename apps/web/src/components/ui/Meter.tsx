import { cn } from "@/lib/cn";

interface MeterProps {
  label: string;
  value: number;
  max: number;
  /** Ratio at or above which the bar turns green (default 0.75). */
  goodAt?: number;
}

/** Labelled horizontal score bar ("Skills match 21 / 25"). */
export function Meter({ label, value, max, goodAt = 0.75 }: MeterProps) {
  const ratio = max > 0 ? value / max : 0;
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-text-2">
          {value} / {max}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-surface-2"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn("h-2 rounded-full", ratio >= goodAt ? "bg-good" : "bg-accent")}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
