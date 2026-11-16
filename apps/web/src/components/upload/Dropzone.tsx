"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { UPLOAD_ACCEPT } from "@/lib/upload";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** Line under the title, e.g. accepted formats. */
  caption?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  /** `bg` sits on a surface card (Welcome); `surface` sits on the page. */
  tone?: "bg" | "surface";
  className?: string;
}

/**
 * Drag-and-drop or click-to-browse file picker. Keyboard accessible: the
 * whole zone is a button that opens the native file dialog.
 */
export function Dropzone({
  onFiles,
  caption = ".pdf · .docx · .tex · .png · .jpg",
  busy,
  busyLabel = "Uploading…",
  disabled,
  tone = "surface",
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [over, setOver] = useState(false);
  const inactive = disabled || busy;

  function take(list: FileList | null) {
    if (!list || list.length === 0 || inactive) return;
    onFiles(Array.from(list));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive || undefined}
      aria-busy={busy || undefined}
      aria-describedby={`${inputId}-caption`}
      onClick={() => !inactive && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !inactive) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!inactive) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-9 text-center outline-none focus-visible:ring-2 focus-visible:ring-link",
        over ? "border-link bg-sel-bg" : cn("border-border-strong", tone === "bg" ? "bg-bg" : "bg-surface"),
        inactive && "cursor-not-allowed opacity-70",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <UploadIcon size={36} className="text-link" />
      <strong className="text-base">
        {busy ? (
          busyLabel
        ) : (
          <>
            Drop your resume here, or <span className="text-link">browse</span>
          </>
        )}
      </strong>
      <span id={`${inputId}-caption`} className="text-sm text-text-2">
        {caption}
      </span>
    </div>
  );
}
