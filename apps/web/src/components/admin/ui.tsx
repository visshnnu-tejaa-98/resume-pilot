import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";

/** Rounded bordered panel used across admin screens. */
export function AdminCard({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-border bg-surface", className)} {...rest} />;
}

export function CardHeader({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-4", className)}>
      <h2 className="m-0 font-display text-lg font-bold">{title}</h2>
      {aside}
    </div>
  );
}

export function KpiGrid({ min = 180, children }: { min?: number; children: ReactNode }) {
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "crit" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-[18px]">
      <span className="text-[13px] text-text-2">{label}</span>
      <span className={cn("font-mono text-2xl font-semibold", tone === "warn" && "text-warn", tone === "crit" && "text-crit")}>{value}</span>
      {sub ? <span className={cn("text-xs", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-text-2")}>{sub}</span> : null}
    </div>
  );
}

const STATUS_TONES: Record<string, ChipTone> = {
  active: "good",
  succeeded: "good",
  captured: "good",
  sent: "good",
  delivered: "info",
  opened: "good",
  running: "info",
  pending: "info",
  created: "info",
  queued: "info",
  failed: "crit",
  suspended: "crit",
  bounced: "crit",
  refunded: "warn",
  held: "warn",
  skipped: "neutral",
};

/** Pill for a DB status value; label defaults to Title Case. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  return (
    <Chip tone={STATUS_TONES[status] ?? "neutral"} pill className="px-[9px] py-[3px] text-xs font-semibold whitespace-nowrap">
      {text}
    </Chip>
  );
}

/** Scrollable table inside a card with uppercase headers. */
export function AdminTable({ head, children, minWidth = 760, className }: { head: ReactNode[]; children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-surface-2 text-left">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-3 text-xs uppercase tracking-[0.06em] whitespace-nowrap text-text-2 first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tr]:border-t [&_tr]:border-border">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-text-2">
        {children}
      </td>
    </tr>
  );
}

/** Pill-shaped filter links (status chips on AI jobs / email log). */
export function FilterChips({ items }: { items: { href: string; label: string; count?: number | string; on: boolean }[] }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <Link
          key={c.href}
          role="tab"
          aria-selected={c.on}
          href={c.href}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold no-underline",
            c.on ? "border-text bg-text text-surface" : "border-border bg-surface text-text hover:border-border-strong",
          )}
        >
          {c.label}
          {c.count !== undefined ? <span className={cn("font-mono text-xs", c.on ? "opacity-80" : "text-text-2")}>{c.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** "Sample/placeholder" notice for parts whose backend isn't built. */
export function NotWiredNote({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-3 text-[13px] leading-normal text-text-2">{children}</p>
  );
}
