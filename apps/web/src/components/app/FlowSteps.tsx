import { cn } from "@/lib/cn";

const STEPS = ["Upload", "Review", "Job description", "Generate", "Score"] as const;

/**
 * The 5-stop progress route at the top of Upload / Review / Job / Generate
 * (design/screens/Upload.dc.html). `current` is 0-based; earlier stops
 * render as done.
 */
export function FlowSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Progress" className="m-0 grid max-w-[760px] list-none grid-cols-5 p-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const on = i === current;
        return (
          <li key={label} aria-current={on ? "step" : undefined} className="flex flex-col gap-2">
            <div className="flex items-center">
              <span
                className={cn(
                  "box-border flex size-7 flex-none items-center justify-center rounded-full border-2 font-mono text-xs font-semibold",
                  on && "border-accent bg-accent text-on-accent",
                  done && "border-good bg-good text-white",
                  !on && !done && "border-border-strong bg-surface text-text-2",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "mx-1.5 flex-1 border-t-2 border-dashed",
                  i === STEPS.length - 1 ? "border-transparent" : done ? "border-good" : "border-border-strong",
                )}
              />
            </div>
            <span className={cn("text-[13px] max-sm:text-[11px]", on ? "font-semibold text-text" : "font-medium text-text-2")}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
