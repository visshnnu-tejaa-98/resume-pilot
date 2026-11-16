import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Navy variant (credit balance). */
  hero?: boolean;
  action?: { href: string; label: string };
}

/** Dashboard / wallet KPI tile with a big mono number. */
export function StatCard({ label, value, sub, hero, action }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl p-5",
        hero ? "bg-hero text-on-hero" : "border border-border bg-surface",
      )}
    >
      <span className={cn("text-[13px]", hero ? "text-on-hero-3" : "text-text-2")}>{label}</span>
      <span className="font-mono text-[30px] font-semibold leading-tight">{value}</span>
      {action ? (
        <Link href={action.href} className={cn("text-[13px] font-semibold", hero ? "text-hero-accent" : "text-link")}>
          {action.label}
        </Link>
      ) : sub ? (
        <span className={cn("text-[13px]", hero ? "text-on-hero-3" : "text-text-2")}>{sub}</span>
      ) : null}
    </div>
  );
}
