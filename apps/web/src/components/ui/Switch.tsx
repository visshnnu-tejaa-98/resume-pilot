"use client";

import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** 40×24 toggle (Settings → Email notifications). */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "box-border flex h-6 w-10 flex-none cursor-pointer rounded-full border-0 p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "justify-end bg-link" : "justify-start bg-border-strong",
      )}
    >
      <span className="size-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}
