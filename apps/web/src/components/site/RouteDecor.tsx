import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

interface RouteCurveProps {
  width: number;
  height: number;
  d: string;
  className?: string;
  style?: CSSProperties;
  dash?: string;
}

/** Dashed orange "flight path" flourish used on navy cards. */
export function RouteCurve({ width, height, d, className, style, dash = "8 10" }: RouteCurveProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("pointer-events-none absolute", className)}
      style={style}
    >
      <path d={d} fill="none" stroke="#FF9900" strokeWidth="2" strokeDasharray={dash} />
    </svg>
  );
}

/** Grid + flight path behind the landing hero. */
export function HeroBackdrop() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      <defs>
        <pattern id="rp-hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" />
        </pattern>
      </defs>
      <rect width="1440" height="640" fill="url(#rp-hero-grid)" />
      <path
        d="M-20 560 C 300 540, 420 300, 760 320 S 1200 120, 1480 90"
        fill="none"
        stroke="#FF9900"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeDasharray="8 10"
      />
      <circle cx="760" cy="320" r="5" fill="#FF9900" fillOpacity="0.8" />
    </svg>
  );
}

interface StopDotProps {
  n: number | string;
  highlight?: boolean;
  /** `hero` = on a navy band, `theme` = on page background. */
  surface?: "theme" | "hero";
  size?: "sm" | "md" | "lg";
  last?: boolean;
}

const dotSizes = { sm: "size-8 text-[13px]", md: "size-9 text-sm", lg: "size-10 text-[15px]" };

/** Numbered circle followed by a dashed connector to the next stop. */
export function StopDot({ n, highlight, surface = "theme", size = "lg", last }: StopDotProps) {
  const dot = highlight
    ? surface === "hero"
      ? "bg-brand text-brand-ink"
      : "bg-accent text-on-accent"
    : surface === "hero"
      ? "bg-hero-chip text-on-hero"
      : "bg-hero text-on-hero";
  return (
    <span className="flex items-center gap-2.5">
      <span className={cn("flex flex-none items-center justify-center rounded-full font-mono font-semibold", dotSizes[size], dot)}>
        {n}
      </span>
      {size !== "md" ? (
        <span
          className={cn(
            "flex-1 border-t-2 border-dashed",
            last ? "border-transparent" : surface === "hero" ? "border-hero-line-strong" : "border-border-strong",
          )}
        />
      ) : null}
    </span>
  );
}
