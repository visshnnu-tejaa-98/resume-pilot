import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type CardTone = "surface" | "bg" | "hero" | "accent-dashed";

const tones: Record<CardTone, string> = {
  surface: "bg-surface border border-border",
  bg: "bg-bg border border-border",
  hero: "bg-hero text-on-hero relative overflow-hidden",
  "accent-dashed": "bg-accent-tint border-2 border-dashed border-accent-line",
};

interface CardProps extends ComponentProps<"div"> {
  tone?: CardTone;
  radius?: "md" | "lg" | "xl";
  shadow?: boolean;
}

const radii = { md: "rounded-xl", lg: "rounded-[14px]", xl: "rounded-2xl" };

/** Rounded panel. `hero` is the navy card with fixed light text. */
export function Card({ tone = "surface", radius = "md", shadow, className, ...rest }: CardProps) {
  return <div className={cn(tones[tone], radii[radius], shadow && "shadow-card", className)} {...rest} />;
}
