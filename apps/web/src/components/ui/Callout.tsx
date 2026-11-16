import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { WarningIcon } from "./icons";

type CalloutTone = "warn" | "info" | "crit" | "good";

const tones: Record<CalloutTone, { box: string; icon: string }> = {
  warn: { box: "bg-warn-bg border-warn-line", icon: "text-warn" },
  info: { box: "bg-info-bg border-info-line", icon: "text-info" },
  crit: { box: "bg-crit-bg border-crit-line", icon: "text-crit" },
  good: { box: "bg-good-bg border-good-line", icon: "text-good" },
};

interface CalloutProps {
  tone?: CalloutTone;
  icon?: ReactNode;
  role?: "note" | "status" | "alert";
  className?: string;
  children: ReactNode;
}

/** Tinted inline notice with a leading icon. */
export function Callout({ tone = "warn", icon, role = "note", className, children }: CalloutProps) {
  const t = tones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border px-4 py-3.5 text-sm leading-[1.55]", t.box, className)}>
      <span className={cn("flex-none", t.icon)}>{icon ?? <WarningIcon size={20} />}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
