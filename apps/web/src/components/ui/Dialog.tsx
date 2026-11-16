"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/**
 * Modal over a scrim (estimate confirmations, add money). Closes on
 * Escape and scrim click, traps initial focus inside, restores focus on
 * close.
 */
export function Dialog({ open, onClose, title, subtitle, children, footer, width = 440 }: DialogProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, button, [href], select, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim px-6 pt-[12vh] pb-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        className="flex w-full flex-col rounded-[14px] border border-border bg-surface text-text shadow-modal"
        style={{ maxWidth: width }}
      >
        <div className="flex flex-col gap-1 px-6 pt-[22px]">
          <h2 id={`${id}-t`} className="m-0 font-display text-[22px] font-bold">
            {title}
          </h2>
          {subtitle ? <span className="text-[13px] text-text-2">{subtitle}</span> : null}
        </div>
        <div className="flex flex-col gap-3 px-6 py-[18px]">{children}</div>
        {footer ? <div className="flex justify-end gap-2.5 border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
