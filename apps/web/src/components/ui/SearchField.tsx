import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { SearchIcon } from "./icons";

/** Bordered search input with a leading magnifier. */
export function SearchField({ label, className, ...rest }: ComponentProps<"input"> & { label: string }) {
  return (
    <label
      className={cn(
        "flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 focus-within:border-link",
        className,
      )}
    >
      <SearchIcon size={16} className="text-text-2" />
      <span className="sr-only">{label}</span>
      <input type="search" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none" {...rest} />
    </label>
  );
}
