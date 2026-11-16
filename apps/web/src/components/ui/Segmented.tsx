"use client";

import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Pill tab group on a grey track (filter tabs on My resumes, Wallet). */
export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 rounded-lg bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 cursor-pointer rounded-md border-0 px-3 text-[13px] whitespace-nowrap",
              on ? "bg-surface font-semibold text-text shadow-sm" : "bg-transparent font-medium text-text-2 hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
