import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CtaBarProps {
  title: ReactNode;
  action: ReactNode;
  tone?: "surface" | "hero";
  className?: string;
}

/** Rounded strip with a line of text on the left and links/buttons on the right. */
export function CtaBar({ title, action, tone = "surface", className }: CtaBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-xl p-6",
        tone === "hero" ? "bg-hero text-on-hero" : "border border-border bg-surface",
        className,
      )}
    >
      <span className={cn(tone === "hero" ? "text-[17px] font-semibold" : "text-base")}>{title}</span>
      <div className="flex flex-wrap gap-4">{action}</div>
    </div>
  );
}
