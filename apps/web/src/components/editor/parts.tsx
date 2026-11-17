"use client";

import { useState, type ReactNode } from "react";
import { GRIP_PATH } from "@/components/review/parts";
import { cn } from "@/lib/cn";

export const inputCls =
  "box-border w-full rounded-md border border-border-strong bg-input-bg px-2.5 text-sm font-normal text-text outline-none focus-visible:border-link disabled:opacity-70";

const EYE_ON = "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6";

export function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold", className)}>
      {label}
      {children}
    </label>
  );
}

export function IconButton({ label, className, children, ...rest }: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("flex size-[30px] flex-none cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-base text-text disabled:cursor-default disabled:opacity-40", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EyeButton({ visible, name, onClick, disabled }: { visible: boolean; name: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`${visible ? "Hide" : "Show"} ${name}`}
      aria-pressed={!visible}
      title={visible ? "Hide from resume" : "Show on resume"}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex size-7 flex-none cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default", visible ? "text-text-2" : "text-border-strong")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d={visible ? EYE_ON : EYE_OFF} />
      </svg>
    </button>
  );
}

/** Comma- or line-separated list, edited as text and committed on blur. */
export function ListField({ value, onCommit, separator = "comma" }: { value: string[]; onCommit: (v: string[]) => void; separator?: "comma" | "line" }) {
  const joined = value.join(separator === "comma" ? ", " : "\n");
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    onCommit(draft.split(separator === "comma" ? /,/ : /\n/).map((s) => s.trim()).filter(Boolean));
    setDraft(null);
  };
  const props = { value: draft ?? joined, onChange: (e: { target: { value: string } }) => setDraft(e.target.value), onBlur: commit };
  return separator === "line" ? <textarea rows={3} {...props} className={cn(inputCls, "resize-y py-2")} /> : <input {...props} className={cn(inputCls, "h-[38px]")} />;
}

/**
 * Reorderable list: drag by the grip, or focus the grip and use ↑/↓.
 * Drags only land inside the same `group`, so bullets can't jump lists.
 */
export function SortableList<T extends { id: string }>({
  group,
  items,
  onMove,
  render,
  itemLabel,
  disabled,
}: {
  group: string;
  items: T[];
  onMove: (from: number, to: number) => void;
  render: (item: T, handle: ReactNode, index: number) => ReactNode;
  itemLabel: (item: T) => string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState<number | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const type = `application/x-rp-${group.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        const handle = disabled ? (
          <span className="w-6" />
        ) : (
          <button
            type="button"
            aria-label={`Move ${itemLabel(it)} (${i + 1} of ${items.length}). Use arrow keys.`}
            onPointerDown={() => setArmed(i)}
            onPointerUp={() => setArmed(null)}
            onKeyDown={(e) => {
              const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
              if (to < 0 || to >= items.length) return;
              e.preventDefault();
              onMove(i, to);
            }}
            className="flex size-6 flex-none cursor-grab items-center justify-center rounded border-0 bg-transparent p-0 text-border-strong hover:text-text-2 focus-visible:text-text"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </button>
        );
        return (
          <div
            key={it.id}
            draggable={armed === i}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(type, String(i));
              setFrom(i);
            }}
            onDragOver={(e) => {
              if (from === null || !e.dataTransfer.types.includes(type)) return;
              e.preventDefault();
              e.stopPropagation();
              setOver(i);
            }}
            onDrop={(e) => {
              if (from === null || !e.dataTransfer.types.includes(type)) return;
              e.preventDefault();
              e.stopPropagation();
              onMove(from, i);
              setFrom(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setArmed(null);
              setFrom(null);
              setOver(null);
            }}
            className={cn("rounded-lg", from === i && "opacity-40", over === i && from !== null && from !== i && "outline-2 outline-offset-2 outline-accent outline-dashed")}
          >
            {render(it, handle, i)}
          </div>
        );
      })}
    </div>
  );
}
