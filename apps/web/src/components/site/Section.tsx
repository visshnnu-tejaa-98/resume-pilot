import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const widths = { sm: "max-w-[1080px]", md: "max-w-[1180px]", lg: "max-w-[1280px]" } as const;

interface ContainerProps extends ComponentProps<"div"> {
  width?: keyof typeof widths;
}

/** Centred content column with the 24px side gutter. */
export function Container({ width = "lg", className, ...rest }: ContainerProps) {
  return <div className={cn("mx-auto px-6", widths[width], className)} {...rest} />;
}

interface BandProps extends ComponentProps<"section"> {
  tone?: "surface" | "hero";
}

/** Full-bleed band: white surface with hairlines, or navy hero. */
export function Band({ tone = "surface", className, ...rest }: BandProps) {
  return (
    <section
      className={cn(
        tone === "surface" ? "border-y border-border bg-surface" : "bg-hero text-on-hero",
        className,
      )}
      {...rest}
    />
  );
}

/** Two-column responsive split used by most marketing sections. */
export function Split({ min = 460, className, style, ...rest }: ComponentProps<"div"> & { min?: number }) {
  return (
    <div
      className={cn("grid items-center", className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, ...style }}
      {...rest}
    />
  );
}

/** Auto-fit grid of equal columns. */
export function AutoGrid({ min, className, style, ...rest }: ComponentProps<"div"> & { min: number }) {
  return (
    <div
      className={cn("grid", className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, ...style }}
      {...rest}
    />
  );
}
