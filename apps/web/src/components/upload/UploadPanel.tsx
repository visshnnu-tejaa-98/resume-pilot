"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileTile } from "@/components/app/FileTile";
import { Button } from "@/components/ui/Button";
import { CrossIcon } from "@/components/ui/icons";
import { fmtBytes } from "@/lib/format";
import { appRoutes } from "@/lib/routes";
import { trpc } from "@/lib/trpc-client";
import type { UploadResult } from "@/lib/upload";
import { Dropzone } from "./Dropzone";
import { useResumeUpload } from "./useResumeUpload";

const POLL_MS = 3000;

type Tracked = {
  resumeId: string;
  name: string;
  size: number;
  tag: string;
  phase: "reading" | "failed";
  message?: string;
};

const tagOf = (name: string) => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toUpperCase();
  return ext === "JPEG" ? "JPG" : ext;
};

function Bar({ ratio, indeterminate }: { ratio?: number; indeterminate?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      {indeterminate ? (
        <div className="h-1.5 w-1/3 animate-[rp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-link" />
      ) : (
        <div className="h-1.5 rounded-full bg-link transition-[width]" style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }} />
      )}
    </div>
  );
}

/**
 * Upload → server extraction → Review. Shows byte progress while
 * sending, then polls the resume's status and moves on to the review
 * screen once it's ready (or shows the reason if it couldn't be read).
 */
export function UploadPanel() {
  const router = useRouter();
  const [pickedName, setPickedName] = useState<{ name: string; size: number } | null>(null);
  const [tracked, setTracked] = useState<Tracked | null>(null);

  const onDone = useCallback((res: UploadResult, files: File[]) => {
    const first = files[0]!;
    const size = files.reduce((n, f) => n + f.size, 0);
    setTracked({
      resumeId: res.resumeId,
      name: files.length > 1 ? `${first.name} + ${files.length - 1} more` : first.name,
      size,
      tag: tagOf(first.name),
      phase: res.status === "failed" ? "failed" : "reading",
      message: res.status === "failed" ? "We couldn’t start reading this file. Try again." : undefined,
    });
  }, []);
  const { upload, cancel, busy, progress, error, setError } = useResumeUpload(onDone);

  // Poll the server until extraction finishes.
  useEffect(() => {
    if (!tracked || tracked.phase !== "reading") return;
    let alive = true;
    const tick = async () => {
      try {
        const list = await trpc.resumes.list.query();
        const row = list.find((r) => r.id === tracked.resumeId);
        if (!alive || !row) return;
        if (row.status === "ready") router.push(appRoutes.review(row.id));
        else if (row.status === "failed")
          setTracked((t) => t && { ...t, phase: "failed", message: row.extractionError ?? "We couldn’t read this file." });
      } catch {
        /* transient; try again next tick */
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [tracked, router]);

  function start(files: File[]) {
    setTracked(null);
    const first = files[0];
    setPickedName(first ? { name: files.length > 1 ? `${first.name} + ${files.length - 1} more` : first.name, size: files.reduce((n, f) => n + f.size, 0) } : null);
    void upload(files);
  }

  return (
    <>
      <Dropzone
        variant="large"
        onFiles={start}
        disabled={busy || tracked?.phase === "reading"}
        title={
          <>
            Drag your resume here, or <span className="text-link">choose a file</span>
          </>
        }
        caption="PDF, DOCX, LaTeX (.tex), PNG or JPG · up to 10 MB · up to 5 pages or images"
      />

      {busy && pickedName ? (
        <div className="flex items-center gap-3.5 rounded-[10px] border border-border bg-surface px-4 py-3.5">
          <FileTile label={tagOf(pickedName.name)} size="sm" tone="muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex justify-between gap-2 text-sm">
              <strong className="truncate">{pickedName.name}</strong>
              <span className="font-mono whitespace-nowrap text-text-2">{fmtBytes(pickedName.size)}</span>
            </div>
            <Bar ratio={progress} />
            <span className="text-[13px] text-text-2">Uploading… {Math.round(progress * 100)}%</span>
          </div>
          <button
            type="button"
            aria-label="Cancel upload"
            onClick={cancel}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md text-text-2 hover:bg-surface-2"
          >
            <CrossIcon size={18} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {tracked?.phase === "reading" ? (
        <div aria-busy="true" className="flex items-center gap-3.5 rounded-[10px] border border-border bg-surface px-4 py-3.5">
          <FileTile label={tracked.tag} size="sm" tone="muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex justify-between gap-2 text-sm">
              <strong className="truncate">{tracked.name}</strong>
              <span className="font-mono whitespace-nowrap text-text-2">{fmtBytes(tracked.size)}</span>
            </div>
            <Bar indeterminate />
            <span className="text-[13px] text-text-2">Reading text and sections… we&apos;ll open the review when it&apos;s done.</span>
          </div>
        </div>
      ) : null}

      {tracked?.phase === "failed" || error ? (
        <div role="alert" className="flex items-center gap-3.5 rounded-[10px] border border-crit-line bg-crit-bg px-4 py-3.5">
          <span className="flex h-11 w-9 flex-none items-center justify-center rounded bg-surface font-mono text-[10px] font-semibold text-text-2">
            {tracked?.tag ?? (pickedName ? tagOf(pickedName.name) : "FILE")}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <strong className="truncate text-sm">{tracked?.name ?? pickedName?.name ?? "Upload"}</strong>
            <span className="text-[13px] font-medium text-crit">{tracked?.message ?? error}</span>
          </div>
          <Button
            variant="outline"
            className="h-[34px] border-border-strong bg-surface px-3 text-[13px]"
            onClick={() => {
              setTracked(null);
              setError(null);
              setPickedName(null);
            }}
          >
            Replace
          </Button>
        </div>
      ) : null}
    </>
  );
}
