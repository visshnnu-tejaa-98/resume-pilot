import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";

interface CheckItemProps {
  children: ReactNode;
  /** `hero` uses the fixed green for navy surfaces. */
  tone?: "theme" | "hero";
  size?: number;
  className?: string;
}

/** A green tick followed by text. */
export function CheckItem({ children, tone = "theme", size = 18, className }: CheckItemProps) {
  return (
    <span className={cn("flex items-start gap-2.5", className)}>
      <CheckIcon size={size} className={cn("mt-px flex-none", tone === "hero" ? "text-hero-good" : "text-good")} />
      <span>{children}</span>
    </span>
  );
}
