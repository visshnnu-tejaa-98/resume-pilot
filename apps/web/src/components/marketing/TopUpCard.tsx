import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { pricing } from "@/content/marketing";

/** Dashed orange "Launch offer" card with the EARLYBIRD code. */
export function LaunchOfferCard({
  size = "md",
  kicker = "Launch offer",
  children,
  footnote,
}: {
  size?: "md" | "lg";
  kicker?: string;
  children: ReactNode;
  footnote: string;
}) {
  return (
    <Card tone="accent-dashed" radius={size === "lg" ? "xl" : "lg"} className="flex flex-col gap-3 p-7">
      <span
        className={cn(
          "text-[13px]",
          size === "lg" ? "font-bold uppercase tracking-[0.08em] text-accent-text" : "font-semibold text-text-2",
        )}
      >
        {kicker}
      </span>
      <span className={cn("font-mono font-bold tracking-[0.06em]", size === "lg" ? "text-[30px]" : "text-[26px]")}>
        {pricing.launchCode}
      </span>
      <span className="text-base leading-normal">{children}</span>
      <span className="text-[13px] text-text-2">{footnote}</span>
    </Card>
  );
}
