"use client";

import type { Resume } from "@resume-pilot/validators/resume";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { isFlagOpen, useReviewStore } from "@/stores/review-store";

export const GRIP_PATH = "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01";

export function Grip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="flex-none text-border-strong">
      <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Small bordered button used for "+ Add role", "Remove", etc. */
export function SmallButton({ className, ...rest }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "h-[34px] cursor-pointer rounded-md border border-border-strong bg-transparent px-3 text-[13px] font-semibold text-text hover:bg-surface-2",
        className,
      )}
      {...rest}
    />
  );
}

/** "+ Add" style dashed link button. */
export function DashedButton({ className, ...rest }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer rounded-md border border-dashed border-border-strong bg-transparent px-2.5 py-[5px] text-[13px] font-semibold text-link hover:bg-surface-2",
        className,
      )}
      {...rest}
    />
  );
}

/** One section card ("Personal information", "Work experience"). */
export function SectionCard({
  id,
  title,
  open = 0,
  action,
  children,
}: {
  id: string;
  title: string;
  open?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4 rounded-xl border border-border bg-surface p-[22px] max-sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 font-display text-[19px] font-bold">
          {title}
          {open > 0 ? (
            <Chip tone="warn" pill className="px-[9px] py-[3px] font-sans text-xs font-semibold">
              {open} to check
            </Chip>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Collapsible entry (a role, a degree, a project). Starts open when it has fields to check. */
export function EntryCard({
  title,
  summary,
  open,
  onRemove,
  children,
}: {
  title: string;
  summary?: string;
  open: number;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(open > 0);
  return (
    <div className={cn("flex flex-col gap-3.5 rounded-[10px] border p-4", open ? "border-warn-line" : "border-border")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="truncate text-[15px]">{title}</strong>
          {!expanded && summary ? <span className="text-[13px] text-text-2">{summary}</span> : null}
        </div>
        <div className="flex flex-none items-center gap-2">
          {open > 0 ? (
            <Chip tone="warn" pill className="px-[9px] py-[3px] text-xs font-semibold">
              {open} to check
            </Chip>
          ) : null}
          <button type="button" onClick={() => setExpanded((e) => !e)} className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-link">
            {expanded ? "Collapse" : "Expand"}
          </button>
          {expanded ? (
            <button type="button" onClick={onRemove} className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-text-2 hover:text-crit">
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {expanded ? children : null}
    </div>
  );
}

interface ReviewFieldProps {
  path: string;
  label: string;
  value: string;
  set: (d: Resume, v: string) => void;
  multiline?: boolean;
  /** Visually hide the label (bullets). */
  hideLabel?: boolean;
  trailing?: ReactNode;
}

/**
 * Text field bound to a resume path. Highlights an open extraction flag
 * with its reason and a "Looks right" button.
 */
export function ReviewField({ path, label, value, set, multiline, hideLabel, trailing }: ReviewFieldProps) {
  const update = useReviewStore((s) => s.update);
  const confirm = useReviewStore((s) => s.confirm);
  const flag = useReviewStore((s) => (isFlagOpen(s, path) ? s.flags[path] : undefined));

  const cls = cn(
    "box-border w-full rounded-md bg-input-bg text-sm font-normal text-text outline-none focus-visible:ring-2 focus-visible:ring-link/30",
    flag ? "border-2 border-warn-line bg-warn-bg" : "border border-border-strong focus-visible:border-link",
    multiline ? "min-h-[70px] resize-y p-2.5 leading-[1.6]" : "h-10 px-2.5",
  );
  const onChange = (v: string) => update((d) => set(d, v), path);

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold">
      <span className={cn("flex items-center justify-between gap-2", hideLabel && "sr-only")}>
        {label}
        {flag ? <span className="text-xs font-medium text-warn">{flag.confidence === "low" ? "Check this" : "Worth a look"}</span> : null}
      </span>
      <span className="flex items-center gap-2">
        {multiline ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
        )}
        {trailing}
      </span>
      {flag ? (
        <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-warn">
          <span>
            {flag.reason}
            {flag.source?.line ? <em className="block font-normal text-text-2">Read as: “{flag.source.line}”</em> : null}
          </span>
          <Button
            variant="outline"
            className="h-7 border-border-strong px-2.5 text-xs"
            onClick={(e) => {
              e.preventDefault();
              confirm(path);
            }}
          >
            Looks right
          </Button>
        </span>
      ) : null}
    </label>
  );
}

/** Editable bullet list with drag-handle look, kind tag and remove. */
export function BulletList({
  bullets,
  pathFor,
  set,
  onAdd,
  onRemove,
}: {
  bullets: { id: string; text: string; kind?: string }[];
  pathFor: (id: string) => string;
  set: (d: Resume, id: string, v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">Bullets</span>
      {bullets.map((b, i) => (
        <div key={b.id} className="flex items-start gap-2">
          <span className="mt-[13px]">
            <Grip />
          </span>
          <ReviewField
            path={pathFor(b.id)}
            label={`Bullet ${i + 1}`}
            hideLabel
            value={b.text}
            set={(d, v) => set(d, b.id, v)}
            trailing={
              <>
                {b.kind ? (
                  <span className="rounded-md bg-surface-2 px-2 py-[3px] text-xs font-normal whitespace-nowrap text-text-2 capitalize max-sm:hidden">
                    {b.kind}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Remove bullet ${i + 1}`}
                  onClick={() => onRemove(b.id)}
                  className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-2 hover:bg-surface-2 hover:text-crit"
                >
                  ×
                </button>
              </>
            }
          />
        </div>
      ))}
      <DashedButton className="self-start" onClick={onAdd}>
        + Add bullet
      </DashedButton>
    </div>
  );
}
