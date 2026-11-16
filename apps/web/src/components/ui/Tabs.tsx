"use client";

import { cn } from "@/lib/cn";

interface TabsProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

/** Underlined tab strip (Wallet, Settings, Legal). */
export function Tabs<T extends string>({ label, value, options, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}>
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
              "-mb-px cursor-pointer border-0 border-b-[3px] bg-transparent px-4 py-3 text-sm font-semibold whitespace-nowrap",
              on ? "border-accent text-text" : "border-transparent text-text-2 hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
