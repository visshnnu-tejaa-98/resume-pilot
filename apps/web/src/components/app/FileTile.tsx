import { cn } from "@/lib/cn";

/** Small document-shaped tile with the file type ("PDF"). */
export function FileTile({ label, size = "md", tone = "surface" }: { label: string; size?: "sm" | "md"; tone?: "surface" | "muted" }) {
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded font-mono text-[10px] font-semibold text-text-2",
        size === "md" ? "h-12 w-10" : "h-11 w-9",
        tone === "surface" ? "border border-border-strong bg-surface" : "bg-surface-2",
      )}
    >
      {label}
    </span>
  );
}
