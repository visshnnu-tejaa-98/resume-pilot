import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small uppercase kicker above section headings ("THE FLIGHT ROUTE"). */
export function Eyebrow({ className, tone = "accent", ...rest }: ComponentProps<"span"> & { tone?: "accent" | "hero" }) {
  return (
    <span
      className={cn(
        "text-[13px] font-bold uppercase tracking-[0.1em]",
        tone === "hero" ? "text-hero-accent" : "text-accent-text",
        className,
      )}
      {...rest}
    />
  );
}

/** Monospace kicker ("STOP 01 · FREE"). */
export function MonoKicker({ className, ...rest }: ComponentProps<"span">) {
  return <span className={cn("font-mono text-[13px] font-semibold text-accent-text", className)} {...rest} />;
}

const displaySizes = {
  /** Landing hero */
  hero: "text-[clamp(40px,6vw,68px)] leading-[1.02] tracking-[-0.025em]",
  /** Page title (About) */
  xl: "text-[clamp(36px,5vw,60px)] leading-[1.04] tracking-[-0.025em]",
  /** Page title (Pricing / How it works) */
  lg: "text-[clamp(36px,5vw,56px)] leading-[1.05] tracking-[-0.025em]",
  /** Page title (Contact / FAQ / 404) */
  md: "text-[clamp(36px,5vw,52px)] leading-[1.05] tracking-[-0.025em]",
  /** Big section heading */
  section: "text-[clamp(30px,4vw,44px)] leading-[1.1] tracking-[-0.02em]",
  /** Standard section heading */
  h2: "text-[34px] leading-tight tracking-[-0.02em]",
} as const;

interface HeadingProps {
  as?: ElementType;
  size?: keyof typeof displaySizes;
  className?: string;
  children: ReactNode;
  id?: string;
}

/** Space Grotesk heading at one of the design's display sizes. */
export function Heading({ as: Tag = "h2", size = "h2", className, ...rest }: HeadingProps) {
  return <Tag className={cn("m-0 font-display font-bold text-balance", displaySizes[size], className)} {...rest} />;
}

export function Lead({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("m-0 text-[17px] leading-[1.7] text-text-2", className)} {...rest} />;
}
