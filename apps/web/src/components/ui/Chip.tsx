import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "good" | "warn" | "info" | "crit" | "neutral" | "gap" | "format";

const tones: Record<ChipTone, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  crit: "bg-crit-bg text-crit",
  neutral: "bg-surface-2 text-text-2",
  /** A missing skill: dashed outline, no fill. */
  gap: "border border-dashed border-border-strong text-text-2",
  /** File-format pill on the landing strip. */
  format: "font-mono font-semibold border border-border bg-bg text-text",
};

interface ChipProps extends ComponentProps<"span"> {
  tone?: ChipTone;
  size?: "xs" | "sm" | "md";
  mono?: boolean;
  pill?: boolean;
}

const sizes = {
  xs: "text-[11px] px-2 py-1",
  sm: "text-[13px] px-[9px] py-[5px]",
  md: "text-[13px] px-3.5 py-2",
};

/** Small status / keyword tag. */
export function Chip({ tone = "neutral", size = "sm", mono, pill, className, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap font-medium",
        pill ? "rounded-full" : "rounded-md",
        tones[tone],
        sizes[size],
        mono && "font-mono font-semibold",
        className,
      )}
      {...rest}
    />
  );
}
