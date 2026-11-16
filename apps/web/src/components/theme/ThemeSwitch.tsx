"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";

const options: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "Auto" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

/** Compact segmented control for the theme store, styled for navy chrome. */
export function ThemeSwitch({ className }: { className?: string }) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  // The persisted value only exists client-side; render neutral until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex rounded-md border border-bar-line p-0.5", className)}>
      {options.map((o) => {
        const on = mounted && mode === o.mode;
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(o.mode)}
            className={cn(
              "cursor-pointer rounded px-2.5 py-1 text-xs font-semibold",
              on ? "bg-bar-active text-white" : "text-on-hero-muted hover:text-on-hero",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
